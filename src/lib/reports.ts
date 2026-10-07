import "server-only";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { alerts, customers, decisions, qaReviews, triageRuns, workspaces, type Typology } from "./db/schema";
import { PROMPT_VERSION } from "./engine/prompt";
import type { ModelRiskPackInput } from "./exports/model-risk";
import { typologyStats } from "./metrics";
import { shadowReport, type DecidedAlertLike } from "./shadow-metrics";

type Workspace = typeof workspaces.$inferSelect;

/**
 * Every decided alert with its first decision (L1 or agent auto-close) and the
 * run that decision was made against: the run recorded on the decision, else
 * the alert's latest run.
 */
export async function loadDecidedAlerts(db: DB, wsId: string): Promise<DecidedAlertLike[]> {
  const decs = await db
    .select({
      alertId: decisions.alertId,
      action: decisions.action,
      runId: decisions.runId,
      createdAt: decisions.createdAt,
      typology: alerts.typology,
      latestRunId: alerts.latestRunId,
      customerName: customers.name,
    })
    .from(decisions)
    .innerJoin(alerts, eq(alerts.id, decisions.alertId))
    .innerJoin(customers, eq(customers.id, alerts.customerId))
    .where(and(eq(decisions.workspaceId, wsId), notInArray(decisions.action, ["sar_file", "sar_no_file"])))
    .orderBy(decisions.createdAt);
  const first = new Map<string, (typeof decs)[number]>();
  for (const d of decs) if (!first.has(d.alertId)) first.set(d.alertId, d);
  const runIds = [...new Set([...first.values()].map((d) => d.runId ?? d.latestRunId).filter((x): x is string => !!x))];
  const runs = runIds.length
    ? await db
        .select({ id: triageRuns.id, recommendation: triageRuns.recommendation, modelRecommendation: triageRuns.modelRecommendation, confidence: triageRuns.confidence })
        .from(triageRuns)
        .where(and(eq(triageRuns.workspaceId, wsId), inArray(triageRuns.id, runIds)))
    : [];
  const byId = new Map(runs.map((r) => [r.id, r]));
  return [...first.values()].map((d) => {
    const run = byId.get(d.runId ?? d.latestRunId ?? "");
    return {
      alertId: d.alertId,
      typology: d.typology,
      customerName: d.customerName,
      agentRecommendation: run?.recommendation ?? null,
      modelRecommendation: run?.modelRecommendation ?? null,
      confidence: run?.confidence ?? null,
      humanAction: d.action,
      decidedAt: d.createdAt,
    };
  });
}

/** Live inputs for the model risk documentation pack. */
export async function modelRiskInput(db: DB, ws: Workspace): Promise<ModelRiskPackInput> {
  const [[runAgg], [latest], alertCounts, qa, rollups, decided] = await Promise.all([
    db
      .select({
        runs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${triageRuns.outcome} = 'completed')::int`,
        locked: sql<number>`count(*) filter (where ${triageRuns.outcome} = 'locked')::int`,
        abstained: sql<number>`count(*) filter (where ${triageRuns.outcome} = 'abstained')::int`,
        valid: sql<number>`count(*) filter (where ${triageRuns.outcome} = 'completed' and (${triageRuns.validation}->>'valid')::boolean)::int`,
        cost: sql<number>`coalesce(sum(${triageRuns.costMicros}), 0)::float8`,
      })
      .from(triageRuns)
      .where(eq(triageRuns.workspaceId, ws.id)),
    db
      .select({ provider: triageRuns.provider, model: triageRuns.model, promptVersion: triageRuns.promptVersion })
      .from(triageRuns)
      .where(eq(triageRuns.workspaceId, ws.id))
      .orderBy(desc(triageRuns.startedAt))
      .limit(1),
    db
      .select({ typology: alerts.typology, n: sql<number>`count(*)::int` })
      .from(alerts)
      .where(eq(alerts.workspaceId, ws.id))
      .groupBy(alerts.typology),
    db
      .select({
        typology: qaReviews.typology,
        sampled: sql<number>`count(*)::int`,
        reviewed: sql<number>`count(*) filter (where ${qaReviews.result} is not null)::int`,
        agreed: sql<number>`count(*) filter (where ${qaReviews.result} = 'agree')::int`,
      })
      .from(qaReviews)
      .where(eq(qaReviews.workspaceId, ws.id))
      .groupBy(qaReviews.typology),
    typologyStats(db, ws.id),
    loadDecidedAlerts(db, ws.id),
  ]);
  const shadow = shadowReport(decided, ws.settings.autonomy);
  const runs = Number(runAgg?.runs ?? 0);
  const completed = Number(runAgg?.completed ?? 0);
  const typologies = [...new Set<Typology>(alertCounts.map((a) => a.typology))].sort();
  const p = ws.settings;
  return {
    workspaceName: ws.name,
    generatedAt: new Date().toISOString(),
    policy: {
      version: p.version,
      autonomy: p.autonomy,
      closeConfidenceFloor: p.closeConfidenceFloor,
      autoCloseConfidenceFloor: p.autoCloseConfidenceFloor,
      watchlistForceL2Similarity: p.watchlistForceL2Similarity,
      minTransactionsForDecision: p.minTransactionsForDecision,
      qaSampleRate: p.qaSampleRate,
      provider: p.provider,
    },
    model: {
      provider: latest?.provider ?? p.provider,
      model: latest?.model ?? (p.provider === "simulated" ? "rules model" : p.provider),
      promptVersion: latest?.promptVersion ?? PROMPT_VERSION,
    },
    runStats: {
      runs,
      completed,
      locked: Number(runAgg?.locked ?? 0),
      abstained: Number(runAgg?.abstained ?? 0),
      citationValidRate: completed ? Number(runAgg?.valid ?? 0) / completed : null,
      avgCostUsd: runs ? Number(runAgg?.cost ?? 0) / runs / 1_000_000 : 0,
    },
    typologyStats: typologies.map((t) => {
      const q = qa.find((x) => x.typology === t);
      const reviewed = Number(q?.reviewed ?? 0);
      const live = shadow.byTypology.find((x) => x.typology === t && x.inShadow);
      return {
        typology: t,
        alerts: Number(alertCounts.find((a) => a.typology === t)?.n ?? 0),
        qaSampled: Number(q?.sampled ?? 0),
        qaAgreement: reviewed ? Number(q?.agreed ?? 0) / reviewed : null,
        // Live agreement while the type is at L0; otherwise what the weekly rollups recorded in shadow weeks.
        shadowAgreement: live?.matrix.agreementRate ?? rollups.find((r) => r.typology === t)?.shadowAgreement ?? null,
      };
    }),
  };
}
