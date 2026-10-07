import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { alerts, decisions, qaReviews, triageRuns, workspaces, type DecisionAction, type PolicySettings } from "./db/schema";
import { DAY, newId } from "./util";
import { queueWebhook } from "./webhooks";

type Workspace = typeof workspaces.$inferSelect;

export { OVERRIDE_REASONS } from "./labels";

export class WorkflowError extends Error {}

async function latestRun(db: DB, ws: Workspace, alertId: string) {
  const [a] = await db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.workspaceId, ws.id)));
  if (!a) throw new WorkflowError("Alert not found in this workspace.");
  const run = a.latestRunId ? (await db.select().from(triageRuns).where(eq(triageRuns.id, a.latestRunId)))[0] : undefined;
  return { alert: a, run };
}

function maybeSample(settings: PolicySettings): boolean {
  return Math.random() < settings.qaSampleRate;
}

export async function decideL1(
  db: DB,
  ws: Workspace,
  input: { alertId: string; outcome: "close" | "escalate"; reasonCode?: string; note?: string; actor: string; seconds: number },
) {
  const { alert, run } = await latestRun(db, ws, input.alertId);
  if (!["triaged", "locked", "new"].includes(alert.status)) {
    throw new WorkflowError(`This alert is already ${alert.status.replace("_", " ")}.`);
  }
  const finalRec = run?.recommendation;
  const modelRec = run?.modelRecommendation ?? null;
  const agrees = finalRec === input.outcome || (finalRec === "human_review" && modelRec === input.outcome);
  const isOverride = !!run && finalRec !== "human_review" && !agrees;
  if (isOverride && !input.reasonCode) {
    throw new WorkflowError("Choose a reason code to override the agent's recommendation.");
  }
  const action: DecisionAction =
    input.outcome === "close" ? (agrees ? "accept_close" : "override_to_close") : agrees ? "accept_escalate" : "override_to_escalate";
  const now = new Date();
  const seconds = Math.max(0, Math.min(Math.round(input.seconds), 4 * 3600));

  await db.transaction(async (tx) => {
    await tx.insert(decisions).values({
      id: newId("DEC"),
      workspaceId: ws.id,
      alertId: alert.id,
      runId: run?.id ?? null,
      actorType: "human",
      actorName: input.actor,
      action,
      reasonCode: input.reasonCode ?? null,
      note: input.note ?? null,
      agreedWithAgent: modelRec ? modelRec === input.outcome : null,
      createdAt: now,
    });
    await tx
      .update(alerts)
      .set({ status: input.outcome === "close" ? "closed" : "escalated", decidedAt: now, l1Seconds: alert.l1Seconds + seconds })
      .where(eq(alerts.id, alert.id));
    if (input.outcome === "close" && run?.recommendation === "close" && maybeSample(ws.settings)) {
      await tx.insert(qaReviews).values({ id: newId("QA"), workspaceId: ws.id, alertId: alert.id, typology: alert.typology, sampledAt: now });
    }
    await appendAudit(tx as unknown as DB, {
      workspaceId: ws.id,
      actorType: "human",
      actorName: input.actor,
      action: `l1.${action}`,
      entityType: "alert",
      entityId: alert.id,
      ts: now,
      payload: { runId: run?.id ?? null, agentRecommendation: finalRec ?? null, reasonCode: input.reasonCode ?? null, note: input.note ?? null, seconds },
    });
  });
  await queueWebhook(
    db,
    ws,
    input.outcome === "close" ? "alert.closed" : "alert.escalated",
    alert.id,
    `${input.outcome === "close" ? "Closed" : "Escalated"} by ${input.actor}${isOverride ? ", overriding the agent" : ""}.`,
  );
  return { action };
}

export async function batchClose(db: DB, ws: Workspace, input: { alertIds: string[]; actor: string }) {
  if (!input.alertIds.length) throw new WorkflowError("Select at least one alert.");
  const rows = await db
    .select({ alert: alerts, run: triageRuns })
    .from(alerts)
    .innerJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
    .where(and(eq(alerts.workspaceId, ws.id), inArray(alerts.id, input.alertIds), eq(alerts.status, "triaged")));
  const eligible = rows.filter((r) => r.run.batchEligible && (ws.settings.autonomy[r.alert.typology] ?? 1) >= 2);
  if (!eligible.length) throw new WorkflowError("None of the selected alerts are eligible for batch approval.");

  const sampleSize = Math.max(1, Math.ceil(eligible.length * ws.settings.qaSampleRate));
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const sampled = new Set(shuffled.slice(0, sampleSize).map((r) => r.alert.id));
  const now = new Date();
  const batchId = newId("BATCH");

  await db.transaction(async (tx) => {
    for (const r of eligible) {
      await tx.insert(decisions).values({
        id: newId("DEC"),
        workspaceId: ws.id,
        alertId: r.alert.id,
        runId: r.run.id,
        actorType: "human",
        actorName: input.actor,
        action: "batch_close",
        note: batchId,
        agreedWithAgent: true,
        createdAt: now,
      });
      await tx.update(alerts).set({ status: "closed", decidedAt: now, l1Seconds: r.alert.l1Seconds + 20 }).where(eq(alerts.id, r.alert.id));
      if (sampled.has(r.alert.id)) {
        await tx.insert(qaReviews).values({ id: newId("QA"), workspaceId: ws.id, alertId: r.alert.id, typology: r.alert.typology, sampledAt: now });
      }
    }
    await appendAudit(tx as unknown as DB, {
      workspaceId: ws.id,
      actorType: "human",
      actorName: input.actor,
      action: "l1.batch_close",
      entityType: "batch",
      entityId: batchId,
      ts: now,
      payload: { alertIds: eligible.map((r) => r.alert.id), qaSampled: [...sampled], skipped: rows.length - eligible.length + (input.alertIds.length - rows.length) },
    });
  });
  await queueWebhook(db, ws, "alert.closed", eligible.map((r) => r.alert.id), `Batch-approved by ${input.actor} (${batchId}).`);
  return { closed: eligible.length, sampled: sampled.size, skipped: input.alertIds.length - eligible.length, batchId };
}

/** L2 determination starts the SAR clock: 30 days, or 60 when no suspect is identified (31 CFR 1020.320). */
export async function markSuspicious(db: DB, ws: Workspace, input: { alertId: string; noSuspect: boolean; actor: string; seconds: number; note?: string }) {
  const { alert } = await latestRun(db, ws, input.alertId);
  if (alert.status !== "escalated") throw new WorkflowError("Only escalated alerts can be marked suspicious.");
  if (alert.suspicionDeterminedAt) throw new WorkflowError("The SAR clock is already running for this alert.");
  const now = new Date();
  const due = new Date(now.getTime() + (input.noSuspect ? 60 : 30) * DAY);
  await db.update(alerts).set({ suspicionDeterminedAt: now, sarDueAt: due, l2Seconds: alert.l2Seconds + Math.max(0, Math.round(input.seconds)) }).where(eq(alerts.id, alert.id));
  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "human",
    actorName: input.actor,
    action: "l2.suspicion_determined",
    entityType: "alert",
    entityId: alert.id,
    ts: now,
    payload: { sarDueAt: due.toISOString(), noSuspectIdentified: input.noSuspect, note: input.note ?? null },
  });
  return { sarDueAt: due };
}

/** Only a human can record a SAR decision. The agent has no code path here. */
export async function recordSarDecision(db: DB, ws: Workspace, input: { alertId: string; file: boolean; actor: string; seconds: number; note?: string }) {
  const { alert, run } = await latestRun(db, ws, input.alertId);
  if (alert.status !== "escalated") throw new WorkflowError("Only escalated alerts can receive a SAR decision.");
  if (input.file && !alert.suspicionDeterminedAt) throw new WorkflowError("Mark the activity suspicious before recording a SAR filing.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(decisions).values({
      id: newId("DEC"),
      workspaceId: ws.id,
      alertId: alert.id,
      runId: run?.id ?? null,
      actorType: "human",
      actorName: input.actor,
      action: input.file ? "sar_file" : "sar_no_file",
      note: input.note ?? null,
      createdAt: now,
    });
    await tx
      .update(alerts)
      .set({ status: input.file ? "sar_filed" : "no_sar", l2Seconds: alert.l2Seconds + Math.max(0, Math.round(input.seconds)) })
      .where(eq(alerts.id, alert.id));
    await appendAudit(tx as unknown as DB, {
      workspaceId: ws.id,
      actorType: "human",
      actorName: input.actor,
      action: input.file ? "l2.sar_filed" : "l2.closed_no_sar",
      entityType: "alert",
      entityId: alert.id,
      ts: now,
      payload: { note: input.note ?? null, onTime: alert.sarDueAt ? now <= alert.sarDueAt : null },
    });
  });
  await queueWebhook(db, ws, "sar.decided", alert.id, `${input.file ? "SAR filing recorded" : "Closed with no SAR"} by ${input.actor}.`);
}

export async function reviewQa(db: DB, ws: Workspace, input: { qaId: string; result: "agree" | "disagree"; actor: string; note?: string }) {
  const [qa] = await db.select().from(qaReviews).where(and(eq(qaReviews.id, input.qaId), eq(qaReviews.workspaceId, ws.id)));
  if (!qa) throw new WorkflowError("QA item not found.");
  if (qa.result) throw new WorkflowError("This QA item is already reviewed.");
  if (input.result === "disagree" && !input.note?.trim()) throw new WorkflowError("Add a note explaining the disagreement.");
  const now = new Date();
  await db.update(qaReviews).set({ result: input.result, reviewer: input.actor, note: input.note ?? null, reviewedAt: now }).where(eq(qaReviews.id, qa.id));
  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "human",
    actorName: input.actor,
    action: `qa.${input.result}`,
    entityType: "alert",
    entityId: qa.alertId,
    ts: now,
    payload: { qaId: qa.id, note: input.note ?? null },
  });
}

export async function updatePolicy(db: DB, ws: Workspace, next: Omit<PolicySettings, "version">, actor: string) {
  const prev = ws.settings;
  // The webhook lives in the same JSON but is not policy: it never bumps the version and is never overwritten here.
  const { webhook: _ignored, ...policy } = next;
  void _ignored;
  const changed = (Object.keys(policy) as (keyof typeof policy)[]).filter((k) => JSON.stringify(policy[k]) !== JSON.stringify(prev[k]));
  if (!changed.length) return prev;
  const settings: PolicySettings = { ...policy, webhook: prev.webhook, version: prev.version + 1 };
  const stored = { ...policy, version: settings.version };
  await db
    .update(workspaces)
    .set({
      // Merge in SQL so a webhook saved since this request loaded the workspace survives.
      settings: sql`${JSON.stringify(stored)}::jsonb || case when ${workspaces.settings}->'webhook' is not null then jsonb_build_object('webhook', ${workspaces.settings}->'webhook') else '{}'::jsonb end`,
    })
    .where(eq(workspaces.id, ws.id));
  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "human",
    actorName: actor,
    action: "policy.updated",
    entityType: "policy",
    entityId: `v${settings.version}`,
    payload: { from: prev.version, to: settings.version, changed: Object.fromEntries(changed.map((k) => [k, { from: prev[k], to: policy[k] }])) },
  });
  return settings;
}
