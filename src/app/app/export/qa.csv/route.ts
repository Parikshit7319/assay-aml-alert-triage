import { and, asc, eq, inArray } from "drizzle-orm";
import { alerts, decisions, qaReviews, triageRuns } from "@/lib/db/schema";
import { csvResponse } from "@/lib/export-response";
import { qaToCsv } from "@/lib/exports/csv";
import { ACTION_LABEL, REC_LABEL } from "@/lib/labels";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Every QA sample with the agent's recommendation, the decision it checked, and the result. */
export async function GET() {
  const t = await getTenant();
  if (!t) return new Response("Sign in to export QA reviews.", { status: 401 });
  const rows = await t.db
    .select({ qa: qaReviews, recommendation: triageRuns.recommendation })
    .from(qaReviews)
    .innerJoin(alerts, eq(alerts.id, qaReviews.alertId))
    .leftJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
    .where(eq(qaReviews.workspaceId, t.ws.id))
    .orderBy(asc(qaReviews.sampledAt));
  const ids = [...new Set(rows.map((r) => r.qa.alertId))];
  const decs = ids.length
    ? await t.db
        .select({ alertId: decisions.alertId, action: decisions.action })
        .from(decisions)
        .where(and(eq(decisions.workspaceId, t.ws.id), inArray(decisions.alertId, ids)))
        .orderBy(asc(decisions.createdAt))
    : [];
  const firstDecision = new Map<string, string>();
  for (const d of decs) if (!firstDecision.has(d.alertId)) firstDecision.set(d.alertId, ACTION_LABEL[d.action] ?? d.action);
  const csv = qaToCsv(
    rows.map(({ qa, recommendation }) => ({
      ...qa,
      agentRecommendation: recommendation ? REC_LABEL[recommendation] : null,
      humanDecision: firstDecision.get(qa.alertId) ?? null,
    })),
  );
  return csvResponse(csv, `qa-reviews-${t.ws.id}-${new Date().toISOString().slice(0, 10)}.csv`);
}
