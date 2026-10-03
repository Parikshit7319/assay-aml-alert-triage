import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { alerts, customers, qaReviews, triageRuns, type AlertStatus } from "./db/schema";

export const OPEN: AlertStatus[] = ["new", "triaged", "locked"];

export async function sidebarCounts(db: DB, wsId: string) {
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${alerts.status} in ('new','triaged','locked'))::int`,
      l2: sql<number>`count(*) filter (where ${alerts.status} = 'escalated')::int`,
    })
    .from(alerts)
    .where(eq(alerts.workspaceId, wsId));
  const [qa] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(qaReviews)
    .where(and(eq(qaReviews.workspaceId, wsId), isNull(qaReviews.result)));
  return { open: Number(row?.open ?? 0), l2: Number(row?.l2 ?? 0), qa: Number(qa?.n ?? 0) };
}

export async function queueRows(db: DB, wsId: string, statuses: AlertStatus[]) {
  return db
    .select({
      id: alerts.id,
      ruleCode: alerts.ruleCode,
      ruleDescription: alerts.ruleDescription,
      typology: alerts.typology,
      status: alerts.status,
      createdAt: alerts.createdAt,
      slaDueAt: alerts.slaDueAt,
      sarDueAt: alerts.sarDueAt,
      customerName: customers.name,
      customerKind: customers.kind,
      recommendation: triageRuns.recommendation,
      modelRecommendation: triageRuns.modelRecommendation,
      confidence: triageRuns.confidence,
      riskScore: triageRuns.riskScore,
      batchEligible: triageRuns.batchEligible,
      outcome: triageRuns.outcome,
    })
    .from(alerts)
    .innerJoin(customers, eq(customers.id, alerts.customerId))
    .leftJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
    .where(and(eq(alerts.workspaceId, wsId), inArray(alerts.status, statuses)))
    .orderBy(desc(triageRuns.riskScore), desc(alerts.createdAt))
    .limit(500);
}
export type QueueRow = Awaited<ReturnType<typeof queueRows>>[number];
