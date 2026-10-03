import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "@/lib/audit";
import { getDb, type DB } from "@/lib/db/client";
import { alerts, auditEvents, qaReviews, triageRuns, workspaces } from "@/lib/db/schema";
import { createDemoWorkspace } from "@/lib/demo/seed";
import { usageForPeriod } from "@/lib/metering";
import { batchClose, decideL1, markSuspicious, recordSarDecision, WorkflowError } from "@/lib/workflow";

let db: DB;
let wsId: string;
const ws = async () => (await db.select().from(workspaces).where(eq(workspaces.id, wsId)))[0];

beforeAll(async () => {
  db = await getDb();
  wsId = await createDemoWorkspace(db);
});

describe("demo workspace", () => {
  it("seeds 44 alerts, each with an agent run", async () => {
    const rows = await db.select().from(alerts).where(eq(alerts.workspaceId, wsId));
    expect(rows).toHaveLength(44);
    expect(rows.every((a) => a.latestRunId)).toBe(true);
    const runs = await db.select().from(triageRuns).where(eq(triageRuns.workspaceId, wsId));
    expect(runs).toHaveLength(44);
  });

  it("meters one usage event per run", async () => {
    const u = await usageForPeriod(db, await ws());
    expect(u.runs).toBe(44);
    expect(u.costMicros).toBeGreaterThan(0);
  });

  it("keeps an intact hash chain and detects tampering", async () => {
    const before = await verifyChain(db, wsId);
    expect(before.ok).toBe(true);
    expect(before.events).toBeGreaterThan(44);
    const [victim] = await db.select().from(auditEvents).where(eq(auditEvents.workspaceId, wsId)).limit(1).offset(5);
    await db.execute(sql`update audit_events set payload = '{"edited":true}'::jsonb where seq = ${victim.seq}`);
    const after = await verifyChain(db, wsId);
    expect(after.ok).toBe(false);
    expect(after.brokenAtSeq).toBe(victim.seq);
  });
});

describe("analyst workflow", () => {
  it("requires a reason code to override the agent", async () => {
    const w = await ws();
    const [esc] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .innerJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
      .where(and(eq(alerts.workspaceId, wsId), eq(triageRuns.recommendation, "escalate"), eq(alerts.status, "triaged")))
      .limit(1);
    await expect(decideL1(db, w, { alertId: esc.id, outcome: "close", actor: "t", seconds: 60 })).rejects.toBeInstanceOf(WorkflowError);
    const ok = await decideL1(db, w, { alertId: esc.id, outcome: "close", reasonCode: "customer_history", actor: "t", seconds: 60 });
    expect(ok.action).toBe("override_to_close");
  });

  it("batch-closes only eligible alerts and always draws a QA sample", async () => {
    const w = await ws();
    const candidates = await db.select({ id: alerts.id }).from(alerts).where(and(eq(alerts.workspaceId, wsId), eq(alerts.status, "triaged")));
    const before = (await db.select().from(qaReviews).where(eq(qaReviews.workspaceId, wsId))).length;
    const res = await batchClose(db, w, { alertIds: candidates.map((c) => c.id), actor: "t" });
    expect(res.closed).toBeGreaterThanOrEqual(13);
    expect(res.skipped).toBeGreaterThan(0);
    const after = (await db.select().from(qaReviews).where(eq(qaReviews.workspaceId, wsId))).length;
    expect(after - before).toBe(res.sampled);
    expect(res.sampled).toBeGreaterThanOrEqual(1);
  });

  it("starts the SAR clock only at L2 determination, and blocks filing before it", async () => {
    const w = await ws();
    const [esc] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .innerJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
      .where(and(eq(alerts.workspaceId, wsId), eq(triageRuns.recommendation, "escalate"), eq(alerts.status, "triaged")))
      .limit(1);
    await decideL1(db, w, { alertId: esc.id, outcome: "escalate", actor: "t", seconds: 300 });
    const [a1] = await db.select().from(alerts).where(eq(alerts.id, esc.id));
    expect(a1.sarDueAt).toBeNull();
    await expect(recordSarDecision(db, w, { alertId: esc.id, file: true, actor: "t", seconds: 10 })).rejects.toBeInstanceOf(WorkflowError);
    const { sarDueAt } = await markSuspicious(db, w, { alertId: esc.id, noSuspect: false, actor: "t", seconds: 3600 });
    const days = Math.round((sarDueAt.getTime() - Date.now()) / 86_400_000);
    expect(days).toBe(30);
    await recordSarDecision(db, w, { alertId: esc.id, file: true, actor: "t", seconds: 600 });
    const [a2] = await db.select().from(alerts).where(eq(alerts.id, esc.id));
    expect(a2.status).toBe("sar_filed");
  });
});
