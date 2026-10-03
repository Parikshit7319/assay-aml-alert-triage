import "server-only";
import { and, asc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { alerts, decisions, metricRollups, qaReviews, triageRuns, workspaces, type Typology } from "./db/schema";
import { DAY } from "./util";
import { aggregateTypologies, aggregateWeeks, type TypologyStat, type WeekRow } from "./metrics-pure";
export type { TypologyStat, WeekRow };
export { HUMAN_DISAGREEMENT_BASELINE, L3_MIN_AGREEMENT, L3_MIN_QA } from "./metrics-pure";

type Workspace = typeof workspaces.$inferSelect;



export async function weeklySeries(db: DB, wsId: string): Promise<WeekRow[]> {
  return aggregateWeeks(await db.select().from(metricRollups).where(eq(metricRollups.workspaceId, wsId)).orderBy(asc(metricRollups.weekStart)));
}


export async function typologyStats(db: DB, wsId: string): Promise<TypologyStat[]> {
  return aggregateTypologies(await db.select().from(metricRollups).where(eq(metricRollups.workspaceId, wsId)));
}

export interface LiveStats {
  runs: number;
  completed: number;
  citationValidRate: number | null;
  lockedRuns: number;
  avgCostUsd: number;
  avgInputTokens: number;
  p95LatencyMs: number | null;
  humanDecisions: number;
  agreementRate: number | null;
  overrides: number;
  qaReviewed: number;
  qaAgreed: number;
  sarBreaches: number;
  costEstimated: boolean;
}

export async function liveStats(db: DB, wsId: string): Promise<LiveStats> {
  const runs = await db
    .select({
      outcome: triageRuns.outcome,
      valid: sql<boolean>`(${triageRuns.validation}->>'valid')::boolean`,
      cost: triageRuns.costMicros,
      input: triageRuns.inputTokens,
      est: triageRuns.costEstimated,
      ms: sql<number>`extract(epoch from (${triageRuns.finishedAt} - ${triageRuns.startedAt})) * 1000`,
    })
    .from(triageRuns)
    .where(eq(triageRuns.workspaceId, wsId));
  const completed = runs.filter((r) => r.outcome === "completed");
  const lat = runs.map((r) => Number(r.ms)).sort((a, b) => a - b);
  const decs = await db
    .select({ agreed: decisions.agreedWithAgent, actorType: decisions.actorType, action: decisions.action })
    .from(decisions)
    .innerJoin(alerts, eq(alerts.id, decisions.alertId))
    .where(and(eq(decisions.workspaceId, wsId), eq(decisions.actorType, "human"), eq(alerts.historical, false)));
  const l1 = decs.filter((d) => d.action !== "sar_file" && d.action !== "sar_no_file");
  const withAgent = l1.filter((d) => d.agreed != null);
  const qa = await db.select({ result: qaReviews.result }).from(qaReviews).where(and(eq(qaReviews.workspaceId, wsId), isNotNull(qaReviews.result)));
  const [breach] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.workspaceId, wsId), eq(alerts.status, "escalated"), lt(alerts.sarDueAt, new Date())));
  return {
    runs: runs.length,
    completed: completed.length,
    citationValidRate: completed.length ? completed.filter((r) => r.valid).length / completed.length : null,
    lockedRuns: runs.filter((r) => r.outcome === "locked").length,
    avgCostUsd: runs.length ? runs.reduce((s, r) => s + r.cost, 0) / runs.length / 1_000_000 : 0,
    avgInputTokens: completed.length ? Math.round(completed.reduce((s, r) => s + r.input, 0) / completed.length) : 0,
    p95LatencyMs: lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))]) : null,
    humanDecisions: l1.length,
    agreementRate: withAgent.length ? withAgent.filter((d) => d.agreed).length / withAgent.length : null,
    overrides: l1.filter((d) => d.action.startsWith("override")).length,
    qaReviewed: qa.length,
    qaAgreed: qa.filter((q) => q.result === "agree").length,
    sarBreaches: Number(breach?.n ?? 0),
    costEstimated: runs.some((r) => r.est),
  };
}

/**
 * Production rollup: computes one week of metrics per typology from live alerts,
 * decisions and QA. Run nightly (see /api/cron/rollup). Weeks marked synthetic
 * are never overwritten.
 */
export async function rollupWeek(db: DB, ws: Workspace, weekStart: Date): Promise<number> {
  const start = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()));
  const end = new Date(start.getTime() + 7 * DAY);
  const key = start.toISOString().slice(0, 10);
  const rows = await db
    .select({
      typology: alerts.typology,
      status: alerts.status,
      l1: alerts.l1Seconds,
      l2: alerts.l2Seconds,
    })
    .from(alerts)
    .where(and(eq(alerts.workspaceId, ws.id), eq(alerts.historical, false), gte(alerts.decidedAt, start), lt(alerts.decidedAt, end)));
  const decs = await db
    .select({ typology: alerts.typology, agreed: decisions.agreedWithAgent, action: decisions.action })
    .from(decisions)
    .innerJoin(alerts, eq(alerts.id, decisions.alertId))
    .where(and(eq(decisions.workspaceId, ws.id), gte(decisions.createdAt, start), lt(decisions.createdAt, end)));
  const qa = await db
    .select({ typology: qaReviews.typology, result: qaReviews.result })
    .from(qaReviews)
    .where(and(eq(qaReviews.workspaceId, ws.id), gte(qaReviews.reviewedAt, start), lt(qaReviews.reviewedAt, end)));

  const types = new Set<Typology>([...rows.map((r) => r.typology), ...decs.map((d) => d.typology), ...qa.map((q) => q.typology)]);
  let written = 0;
  for (const ty of types) {
    const r = rows.filter((x) => x.typology === ty);
    const d = decs.filter((x) => x.typology === ty && x.agreed != null);
    const q = qa.filter((x) => x.typology === ty);
    const mode = ws.settings.autonomy[ty] === 0 ? "shadow" : "assisted";
    const values = {
      workspaceId: ws.id,
      weekStart: key,
      typology: ty,
      mode: mode as "shadow" | "assisted",
      alerts: r.length,
      closes: r.filter((x) => x.status === "closed" || x.status === "no_sar").length,
      escalations: r.filter((x) => ["escalated", "sar_filed", "no_sar"].includes(x.status)).length,
      sarsFiled: r.filter((x) => x.status === "sar_filed").length,
      l1Seconds: r.reduce((s, x) => s + x.l1, 0),
      l2Seconds: r.reduce((s, x) => s + x.l2, 0),
      recsAccepted: d.filter((x) => x.agreed).length,
      recsOverridden: d.filter((x) => !x.agreed).length,
      qaSampled: q.length,
      qaAgreed: q.filter((x) => x.result === "agree").length,
      missedEscalations: q.filter((x) => x.result === "disagree").length,
      synthetic: false,
    };
    const [existing] = await db
      .select({ synthetic: metricRollups.synthetic })
      .from(metricRollups)
      .where(and(eq(metricRollups.workspaceId, ws.id), eq(metricRollups.weekStart, key), eq(metricRollups.typology, ty)));
    if (existing?.synthetic) continue;
    await db
      .insert(metricRollups)
      .values(values)
      .onConflictDoUpdate({ target: [metricRollups.workspaceId, metricRollups.weekStart, metricRollups.typology], set: values });
    written++;
  }
  return written;
}
