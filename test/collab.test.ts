import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "@/lib/audit";
import { createNote, listMembers, loadCollab, setAssignee, teamWorkload } from "@/lib/collab";
import { getDb, type DB } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { alerts, auditEvents, decisions, leads, triageRuns, user, workspaceMembers, workspaces } from "@/lib/db/schema";
import { createDemoWorkspace } from "@/lib/demo/seed";
import { PROMPT_VERSION } from "@/lib/engine/prompt";
import { buildModelRiskPack } from "@/lib/exports/model-risk";
import { insertLead, parseLead } from "@/lib/leads";
import { queueRows } from "@/lib/queries";
import { loadDecidedAlerts, modelRiskInput } from "@/lib/reports";
import { shadowReport } from "@/lib/shadow-metrics";
import { newId } from "@/lib/util";
import { decideL1, WorkflowError } from "@/lib/workflow";

let db: DB;
let wsId: string;
const ws = async () => (await db.select().from(workspaces).where(eq(workspaces.id, wsId)))[0];
const dana = { id: newId("USR", 10), name: "Dana Kim", email: `dana.${Date.now()}@bank.example` };
const luis = { id: newId("USR", 10), name: "Luis Ortega", email: `lortega.${Date.now()}@bank.example` };
const outsider = { id: newId("USR", 10), name: "Out Sider", email: `out.${Date.now()}@other.example` };

async function openAlerts(n: number) {
  return db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.workspaceId, wsId), eq(alerts.status, "triaged")))
    .limit(n);
}

beforeAll(async () => {
  db = await getDb();
  wsId = await createDemoWorkspace(db);
  await db.insert(user).values([dana, luis, outsider]);
  await db.insert(workspaceMembers).values([
    { workspaceId: wsId, userId: dana.id, role: "analyst" },
    { workspaceId: wsId, userId: luis.id, role: "admin" },
  ]);
});

describe("migrations", () => {
  it("are idempotent: a second run applies nothing", async () => {
    const r = await runMigrations(db, path.join(process.cwd(), "drizzle"));
    expect(r.applied).toBe(0);
  });
});

describe("members and assignment", () => {
  it("lists workspace members with roles, sorted by name", async () => {
    const m = await listMembers(db, wsId);
    expect(m.map((x) => [x.name, x.role])).toEqual([
      ["Dana Kim", "analyst"],
      ["Luis Ortega", "admin"],
    ]);
  });

  it("assigns to members only, audits it, and unassigns", async () => {
    const [a] = await openAlerts(1);
    const w = await ws();
    await expect(setAssignee(db, w, { alertId: a.id, assigneeId: outsider.id, actor: "Luis Ortega" })).rejects.toBeInstanceOf(WorkflowError);
    await expect(setAssignee(db, w, { alertId: "ALT-NOPE00", assigneeId: dana.id, actor: "Luis Ortega" })).rejects.toBeInstanceOf(WorkflowError);

    expect(await setAssignee(db, w, { alertId: a.id, assigneeId: dana.id, actor: "Luis Ortega" })).toEqual({ changed: true, assigneeName: "Dana Kim" });
    expect(await setAssignee(db, w, { alertId: a.id, assigneeId: dana.id, actor: "Luis Ortega" })).toEqual({ changed: false, assigneeName: "Dana Kim" });
    const c = await loadCollab(db, wsId, a.id);
    expect(c).toMatchObject({ assigneeId: dana.id, assigneeName: "Dana Kim" });
    expect(c.members).toHaveLength(2);

    const [ev] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.workspaceId, wsId), eq(auditEvents.action, "alert.assigned"), eq(auditEvents.entityId, a.id)));
    expect(ev.payload).toMatchObject({ from: null, to: "Dana Kim", toUserId: dana.id });

    expect(await setAssignee(db, w, { alertId: a.id, assigneeId: null, actor: "Luis Ortega" })).toEqual({ changed: true, assigneeName: null });
    expect((await loadCollab(db, wsId, a.id)).assigneeId).toBeNull();
  });

  it("puts the assignee on queue rows", async () => {
    const [a] = await openAlerts(1);
    await setAssignee(db, await ws(), { alertId: a.id, assigneeId: luis.id, actor: "Dana Kim" });
    const rows = await queueRows(db, wsId, ["triaged"]);
    const row = rows.find((r) => r.id === a.id)!;
    expect(row).toMatchObject({ assigneeId: luis.id, assigneeName: "Luis Ortega" });
  });
});

describe("notes", () => {
  it("stores notes with parsed mentions and a handoff flag, oldest first", async () => {
    const [a] = await openAlerts(1);
    const w = await ws();
    const n1 = await createNote(db, w, { alertId: a.id, body: "  Looks like structuring. @luisortega can you check the branch notes?  ", authorId: dana.id, authorName: "Dana Kim" });
    expect(n1).toMatchObject({ kind: "note", mentions: [luis.id], body: "Looks like structuring. @luisortega can you check the branch notes?" });
    const n2 = await createNote(db, w, { alertId: a.id, body: "Handing to L2. @DanaKim has the call notes.", kind: "handoff", authorId: luis.id, authorName: "Luis Ortega" });
    expect(n2).toMatchObject({ kind: "handoff", mentions: [dana.id] });
    const c = await loadCollab(db, wsId, a.id);
    expect(c.notes.map((n) => n.id)).toEqual([n1.id, n2.id]);
    expect(c.notes[1]).toMatchObject({ authorId: luis.id, authorName: "Luis Ortega", kind: "handoff" });

    const [ev] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.workspaceId, wsId), eq(auditEvents.action, "alert.note"), eq(auditEvents.entityId, a.id)))
      .limit(1);
    expect(ev.payload).toMatchObject({ kind: "note", mentions: ["Luis Ortega"] });
    expect((await verifyChain(db, wsId)).ok).toBe(true);
  });

  it("rejects empty and over-long notes, and drops a non-member author id", async () => {
    const [a] = await openAlerts(1);
    const w = await ws();
    await expect(createNote(db, w, { alertId: a.id, body: "   ", authorId: null, authorName: "x" })).rejects.toBeInstanceOf(WorkflowError);
    await expect(createNote(db, w, { alertId: a.id, body: "x".repeat(4001), authorId: null, authorName: "x" })).rejects.toThrow(/4,000/);
    const ok = await createNote(db, w, { alertId: a.id, body: "x".repeat(4000), authorId: outsider.id, authorName: "You (demo analyst)" });
    expect(ok.authorId).toBeNull();
  });
});

describe("team workload", () => {
  it("counts open, ready, L2 and recent decisions per member, plus unassigned", async () => {
    const w = await ws();
    const [a1, a2] = await openAlerts(2);
    await setAssignee(db, w, { alertId: a1.id, assigneeId: dana.id, actor: "Luis Ortega" });
    await setAssignee(db, w, { alertId: a2.id, assigneeId: dana.id, actor: "Luis Ortega" });
    // Dana escalates one; it moves from open to L2 and counts as her decision.
    const [esc] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .innerJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
      .where(and(eq(alerts.id, a2.id)));
    await decideL1(db, w, { alertId: esc.id, outcome: "escalate", reasonCode: "risk_judgment", actor: "Dana Kim", seconds: 60 });

    const t = await teamWorkload(db, wsId);
    const d = t.members.find((m) => m.userId === dana.id)!;
    expect(d).toMatchObject({ name: "Dana Kim", role: "analyst", l2: 1, decidedLast7d: 1 });
    expect(d.open).toBeGreaterThanOrEqual(1);
    expect(d.oldestOpenDays).not.toBeNull();
    const [{ n: totalOpen }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(alerts)
      .where(and(eq(alerts.workspaceId, wsId), sql`${alerts.status} in ('new','triaged','locked')`));
    expect(t.members.reduce((s, m) => s + m.open, 0) + t.unassigned.open).toBe(Number(totalOpen));
    expect(t.unassigned.open).toBeGreaterThan(0);
  });
});

describe("shadow report and model risk pack", () => {
  it("compares decided alerts with the agent from the database", async () => {
    const items = await loadDecidedAlerts(db, wsId);
    expect(items.length).toBeGreaterThan(0);
    const r = shadowReport(items, (await ws()).settings.autonomy);
    expect(r.overall.total).toBeGreaterThan(0);
    const [{ n }] = await db.select({ n: sql<number>`count(distinct ${decisions.alertId})::int` }).from(decisions).where(eq(decisions.workspaceId, wsId));
    expect(r.overall.total + r.skipped).toBeLessThanOrEqual(Number(n));
  });

  it("stamps the prompt version on runs and in the pack", async () => {
    expect(PROMPT_VERSION).toMatch(/^p-[0-9a-f]{8}$/);
    const runs = await db.select({ pv: triageRuns.promptVersion }).from(triageRuns).where(eq(triageRuns.workspaceId, wsId));
    expect(runs.every((r) => r.pv === PROMPT_VERSION)).toBe(true);
    const input = await modelRiskInput(db, await ws());
    expect(input.model.promptVersion).toBe(PROMPT_VERSION);
    expect(input.runStats.runs).toBe(runs.length);
    expect(input.typologyStats.length).toBeGreaterThan(0);
    const html = buildModelRiskPack(input);
    expect(html).toContain(PROMPT_VERSION);
    expect(html).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("leads", () => {
  it("validates, stores, and swallows honeypot submissions", async () => {
    expect(parseLead({ name: "", email: "a@b.co", company: "X" })).toEqual({ ok: false, error: "Enter your name." });
    expect(parseLead({ name: "A", email: "nope", company: "X" })).toEqual({ ok: false, error: "Enter a work email." });
    expect(parseLead({ name: "A", email: "a@b.co" })).toEqual({ ok: false, error: "Enter your company." });
    const p = parseLead({ name: " Ana ", email: "ana@bank.example", company: "Bank", role: "BSA officer", alerts_per_month: "2,500", message: "", website: "" });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.data).toMatchObject({ name: "Ana", alerts_per_month: 2500, message: null, segment: null });
    const blank = parseLead({ name: "A", email: "a@b.co", company: "C", alerts_per_month: "" });
    expect(blank.ok && blank.data.alerts_per_month).toBeNull();
    const r = await insertLead(db, p.data);
    expect(r.ok && r.id).toBeTruthy();
    const [row] = await db.select().from(leads).where(eq(leads.id, (r as { id: string }).id));
    expect(row).toMatchObject({ name: "Ana", monthlyAlerts: 2500, role: "BSA officer" });

    const bot = parseLead({ name: "B", email: "b@c.co", company: "C", website: "http://spam" });
    expect(bot.ok).toBe(true);
    if (bot.ok) expect(await insertLead(db, bot.data)).toMatchObject({ ok: true, id: null });
  });
});
