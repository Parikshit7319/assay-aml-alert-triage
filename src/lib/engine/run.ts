import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { appendAudit } from "@/lib/audit";
import type { DB } from "@/lib/db/client";
import { alerts, customers, decisions, priorCases, qaReviews, transactions, triageRuns, watchlistEntries, workspaces } from "@/lib/db/schema";
import { canRun, recordUsage } from "@/lib/metering";
import { DAY, newId } from "@/lib/util";
import { runTriage } from "./pipeline";
import { DEFAULT_HIGH_RISK_COUNTRIES } from "./policy";
import { resolveProvider } from "./providers";
import type { EvidenceBundle, TriageResult } from "./types";

type Workspace = typeof workspaces.$inferSelect;

export const agentIdentity = (ws: Workspace) => `triage-agent@${ws.id.toLowerCase()}`;

export async function loadBundle(db: DB, ws: Workspace, alertId: string): Promise<EvidenceBundle> {
  const [alert] = await db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.workspaceId, ws.id)));
  if (!alert) throw new Error(`Alert ${alertId} not found`);
  const [customer] = await db.select().from(customers).where(and(eq(customers.id, alert.customerId), eq(customers.workspaceId, ws.id)));
  const asOf = alert.createdAt.getTime();
  const windowStart = new Date(asOf - 90 * DAY);
  const historyStart = new Date(asOf - 3 * 365 * DAY);
  const end = new Date(asOf + 1);
  const [recent, history, cases, watchlist] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.workspaceId, ws.id), eq(transactions.customerId, customer.id), gte(transactions.ts, windowStart), lt(transactions.ts, end)))
      .orderBy(asc(transactions.ts)),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.workspaceId, ws.id), eq(transactions.customerId, customer.id), gte(transactions.ts, historyStart), lt(transactions.ts, windowStart)))
      .orderBy(asc(transactions.ts)),
    db
      .select()
      .from(priorCases)
      .where(and(eq(priorCases.workspaceId, ws.id), eq(priorCases.customerId, customer.id), lt(priorCases.openedAt, alert.createdAt)))
      .orderBy(asc(priorCases.openedAt)),
    db.select().from(watchlistEntries).where(eq(watchlistEntries.workspaceId, ws.id)),
  ]);
  return {
    alert: {
      id: alert.id,
      ruleCode: alert.ruleCode,
      ruleDescription: alert.ruleDescription,
      typology: alert.typology,
      createdAt: alert.createdAt,
      triggeredTxnIds: alert.triggeredTxnIds,
    },
    customer,
    transactions: recent,
    history,
    priorCases: cases,
    watchlist,
    highRiskCountries: DEFAULT_HIGH_RISK_COUNTRIES,
  };
}

export interface TriageOutcome {
  runId: string;
  result: TriageResult;
  autoClosed: boolean;
}

/**
 * Runs the agent on one alert and persists everything: the run, the alert
 * status, metered usage, the audit event, and an auto-close if earned.
 */
export async function triageAlert(
  db: DB,
  ws: Workspace,
  alertId: string,
  opts: { bundle?: EvidenceBundle; initiatedBy?: string; now?: Date; skipLimit?: boolean } = {},
): Promise<TriageOutcome> {
  if (!opts.skipLimit) {
    const allowed = await canRun(db, ws);
    if (!allowed.ok) throw new Error(allowed.reason);
  }
  const bundle = opts.bundle ?? (await loadBundle(db, ws, alertId));
  const provider = resolveProvider(ws.settings, ws.plan, ws.kind);
  const startedAt = opts.now ?? new Date();
  const result = await runTriage(bundle, ws.settings, provider);
  const finishedAt = new Date(startedAt.getTime() + result.trace.reduce((s, t) => s + t.ms, 0));
  const runId = newId("RUN");
  const identity = agentIdentity(ws);

  await db.insert(triageRuns).values({
    id: runId,
    workspaceId: ws.id,
    alertId,
    startedAt,
    finishedAt,
    agentIdentity: identity,
    provider: result.provider,
    model: result.model,
    policyVersion: ws.settings.version,
    outcome: result.outcome,
    modelRecommendation: result.modelRecommendation,
    recommendation: result.recommendation,
    confidence: result.confidence,
    riskScore: result.riskScore,
    rationale: result.rationale,
    trace: result.trace,
    policyHits: result.policyHits,
    validation: result.validation,
    narrative: result.narrative,
    autoCloseEligible: result.autoCloseEligible,
    batchEligible: result.batchEligible,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costMicros: result.costMicros,
    costEstimated: result.costEstimated,
    error: result.error ?? null,
  });

  await db
    .update(alerts)
    .set({ status: result.outcome === "locked" ? "locked" : "triaged", latestRunId: runId })
    .where(and(eq(alerts.id, alertId), eq(alerts.workspaceId, ws.id)));

  const usageId = await recordUsage(db, ws, result);
  if (ws.plan === "team" && ws.stripeCustomerId) {
    const { reportUsageToStripe } = await import("@/lib/billing/stripe");
    reportUsageToStripe(db, ws, usageId).catch((err) => console.error("Stripe meter report failed", err));
  }

  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "agent",
    actorName: identity,
    action: "agent.triage_completed",
    entityType: "alert",
    entityId: alertId,
    ts: finishedAt,
    payload: {
      runId,
      outcome: result.outcome,
      recommendation: result.recommendation,
      modelRecommendation: result.modelRecommendation,
      confidence: result.confidence,
      provider: result.provider,
      model: result.model,
      policyVersion: ws.settings.version,
      policyHits: result.policyHits.map((h) => h.rule),
      citationsValid: result.validation.valid,
      initiatedBy: opts.initiatedBy ?? "system",
    },
  });

  let autoClosed = false;
  if (result.autoCloseEligible) {
    autoClosed = true;
    const decidedAt = new Date(finishedAt.getTime() + 1);
    await db.insert(decisions).values({
      id: newId("DEC"),
      workspaceId: ws.id,
      alertId,
      runId,
      actorType: "agent",
      actorName: identity,
      action: "auto_close",
      agreedWithAgent: true,
      createdAt: decidedAt,
    });
    await db.update(alerts).set({ status: "closed", decidedAt }).where(eq(alerts.id, alertId));
    if (Math.random() < Math.max(ws.settings.qaSampleRate, 0.2)) {
      await db.insert(qaReviews).values({ id: newId("QA"), workspaceId: ws.id, alertId, typology: bundle.alert.typology, sampledAt: decidedAt });
    }
    await appendAudit(db, {
      workspaceId: ws.id,
      actorType: "agent",
      actorName: identity,
      action: "agent.auto_closed",
      entityType: "alert",
      entityId: alertId,
      ts: decidedAt,
      payload: { runId, confidence: result.confidence, autonomyLevel: ws.settings.autonomy[bundle.alert.typology] },
    });
  }

  return { runId, result, autoClosed };
}
