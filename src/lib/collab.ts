import "server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { alertNotes, alerts, decisions, user, workspaceMembers, workspaces } from "./db/schema";
import { NOTE_MAX, parseMentions } from "./mentions";
import { DAY, newId } from "./util";
import { queueWebhook } from "./webhooks";
import { WorkflowError } from "./workflow";

type Workspace = typeof workspaces.$inferSelect;
export type MemberRole = "owner" | "admin" | "analyst" | "reviewer";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
}

export interface CollabNote {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  /** User ids of mentioned members. */
  mentions: string[];
  kind: "note" | "handoff";
  /** ISO 8601. */
  createdAt: string;
}

export interface CollabData {
  members: Member[];
  assigneeId: string | null;
  assigneeName: string | null;
  /** Oldest first. */
  notes: CollabNote[];
}

export interface WorkloadCounts {
  /** New, ready for review, or locked to a human. */
  open: number;
  /** Ready for review (a subset of open). */
  triaged: number;
  /** Escalated, waiting on an L2 decision. */
  l2: number;
  /** Whole days since the oldest open alert was created; null with nothing open. */
  oldestOpenDays: number | null;
}

export interface WorkloadRow extends WorkloadCounts {
  userId: string;
  name: string;
  role: MemberRole;
  /** Human decisions recorded under this member's name in the last 7 days. */
  decidedLast7d: number;
}

export interface TeamWorkload {
  members: WorkloadRow[];
  /** No owner, or an owner who is no longer a member. */
  unassigned: WorkloadCounts;
  /** Human decisions in the last 7 days by people who are not members (for example the demo analyst). */
  decidedLast7dOther: number;
}

const OPEN_SQL = sql.raw(`('new','triaged','locked')`);

export async function listMembers(db: DB, wsId: string): Promise<Member[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, wsId))
    .orderBy(asc(user.name));
  return rows;
}

export async function loadCollab(db: DB, wsId: string, alertId: string): Promise<CollabData> {
  const [members, [row], notes] = await Promise.all([
    listMembers(db, wsId),
    db
      .select({ assigneeId: alerts.assigneeId, assigneeName: user.name })
      .from(alerts)
      .leftJoin(user, eq(user.id, alerts.assigneeId))
      .where(and(eq(alerts.id, alertId), eq(alerts.workspaceId, wsId))),
    db
      .select()
      .from(alertNotes)
      .where(and(eq(alertNotes.workspaceId, wsId), eq(alertNotes.alertId, alertId)))
      .orderBy(asc(alertNotes.createdAt)),
  ]);
  return {
    members,
    assigneeId: row?.assigneeId ?? null,
    assigneeName: row?.assigneeName ?? null,
    notes: notes.map((n) => ({
      id: n.id,
      authorId: n.authorId,
      authorName: n.authorName,
      body: n.body,
      mentions: n.mentions,
      kind: n.kind,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

const daysSince = (d: Date | string | null, now: Date) => (d ? Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / DAY)) : null);

export async function teamWorkload(db: DB, wsId: string, now = new Date()): Promise<TeamWorkload> {
  const [members, byAssignee, byActor] = await Promise.all([
    listMembers(db, wsId),
    db
      .select({
        assigneeId: alerts.assigneeId,
        open: sql<number>`count(*) filter (where ${alerts.status} in ${OPEN_SQL})::int`,
        triaged: sql<number>`count(*) filter (where ${alerts.status} = 'triaged')::int`,
        l2: sql<number>`count(*) filter (where ${alerts.status} = 'escalated')::int`,
        oldestOpen: sql<string | null>`min(${alerts.createdAt}) filter (where ${alerts.status} in ${OPEN_SQL})`,
      })
      .from(alerts)
      .where(eq(alerts.workspaceId, wsId))
      .groupBy(alerts.assigneeId),
    db
      .select({ actorName: decisions.actorName, n: sql<number>`count(*)::int` })
      .from(decisions)
      .where(and(eq(decisions.workspaceId, wsId), eq(decisions.actorType, "human"), gte(decisions.createdAt, new Date(now.getTime() - 7 * DAY))))
      .groupBy(decisions.actorName),
  ]);

  const counts = (r: (typeof byAssignee)[number] | undefined): WorkloadCounts => ({
    open: Number(r?.open ?? 0),
    triaged: Number(r?.triaged ?? 0),
    l2: Number(r?.l2 ?? 0),
    oldestOpenDays: daysSince(r?.oldestOpen ?? null, now),
  });
  const agg = new Map(byAssignee.map((r) => [r.assigneeId, r]));
  const decided = new Map(byActor.map((r) => [r.actorName, Number(r.n)]));
  const memberNames = new Set(members.map((m) => m.name));

  // Alerts with no owner, or owned by someone who has since left the workspace.
  const memberIds = new Set(members.map((m) => m.id));
  const orphaned = byAssignee.filter((r) => r.assigneeId === null || !memberIds.has(r.assigneeId)).map(counts);
  const unassigned = orphaned.reduce<WorkloadCounts>(
    (acc, c) => ({
      open: acc.open + c.open,
      triaged: acc.triaged + c.triaged,
      l2: acc.l2 + c.l2,
      oldestOpenDays: c.oldestOpenDays == null ? acc.oldestOpenDays : Math.max(acc.oldestOpenDays ?? 0, c.oldestOpenDays),
    }),
    { open: 0, triaged: 0, l2: 0, oldestOpenDays: null },
  );

  return {
    members: members.map((m) => ({ userId: m.id, name: m.name, role: m.role, ...counts(agg.get(m.id)), decidedLast7d: decided.get(m.name) ?? 0 })),
    unassigned,
    decidedLast7dOther: byActor.filter((r) => !memberNames.has(r.actorName)).reduce((s, r) => s + Number(r.n), 0),
  };
}

async function requireAlert(db: DB, wsId: string, alertId: string) {
  const [a] = await db
    .select({ id: alerts.id, assigneeId: alerts.assigneeId })
    .from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.workspaceId, wsId)));
  if (!a) throw new WorkflowError("Alert not found in this workspace.");
  return a;
}

/**
 * Makes a member the owner of an alert, or clears the owner when assigneeId is
 * null. Only workspace members can be assigned. Records "alert.assigned".
 */
export async function setAssignee(db: DB, ws: Workspace, input: { alertId: string; assigneeId: string | null; actor: string }): Promise<{ changed: boolean; assigneeName: string | null }> {
  const alert = await requireAlert(db, ws.id, input.alertId);
  const members = await listMembers(db, ws.id);
  const to = input.assigneeId ? members.find((m) => m.id === input.assigneeId) : null;
  if (input.assigneeId && !to) throw new WorkflowError("Assign the alert to a member of this workspace.");
  if ((alert.assigneeId ?? null) === (to?.id ?? null)) return { changed: false, assigneeName: to?.name ?? null };
  const from = alert.assigneeId ? members.find((m) => m.id === alert.assigneeId) : null;

  await db.update(alerts).set({ assigneeId: to?.id ?? null }).where(and(eq(alerts.id, alert.id), eq(alerts.workspaceId, ws.id)));
  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "human",
    actorName: input.actor,
    action: "alert.assigned",
    entityType: "alert",
    entityId: alert.id,
    payload: { from: from?.name ?? null, to: to?.name ?? null, fromUserId: alert.assigneeId ?? null, toUserId: to?.id ?? null },
  });
  if (to) await queueWebhook(db, ws, "alert.assigned", alert.id, `Assigned to ${to.name} by ${input.actor}.`);
  return { changed: true, assigneeName: to?.name ?? null };
}

/**
 * Adds a note to an alert. Mentions are parsed against the member list. A
 * handoff is a note flagged for the L2 investigator; it changes no status by
 * itself. Records "alert.note".
 */
export async function createNote(
  db: DB,
  ws: Workspace,
  input: { alertId: string; body: string; kind?: "note" | "handoff"; authorId: string | null; authorName: string },
): Promise<CollabNote> {
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!body) throw new WorkflowError("Write the note first.");
  if (body.length > NOTE_MAX) throw new WorkflowError(`Notes are limited to ${NOTE_MAX.toLocaleString("en-US")} characters. This one has ${body.length.toLocaleString("en-US")}.`);
  const kind = input.kind === "handoff" ? "handoff" : "note";
  const alert = await requireAlert(db, ws.id, input.alertId);
  const members = await listMembers(db, ws.id);
  const mentions = parseMentions(body, members);
  const names = mentions.map((id) => members.find((m) => m.id === id)?.name ?? id);
  const createdAt = new Date();
  const id = newId("NOTE");
  const authorId = input.authorId && members.some((m) => m.id === input.authorId) ? input.authorId : null;

  await db.insert(alertNotes).values({
    id,
    workspaceId: ws.id,
    alertId: alert.id,
    authorId,
    authorName: input.authorName,
    body,
    mentions,
    kind,
    createdAt,
  });
  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "human",
    actorName: input.authorName,
    action: "alert.note",
    entityType: "alert",
    entityId: alert.id,
    ts: createdAt,
    payload: { noteId: id, kind, mentions: names, mentionUserIds: mentions, body },
  });
  if (mentions.length) {
    await queueWebhook(db, ws, "alert.note", alert.id, `${input.authorName} mentioned ${names.join(", ")} in a ${kind === "handoff" ? "handoff to L2" : "note"}.`);
  }
  return { id, authorId, authorName: input.authorName, body, mentions, kind, createdAt: createdAt.toISOString() };
}
