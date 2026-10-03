import { and, asc, eq } from "drizzle-orm";
import { authenticateApiKey, json } from "@/lib/api-auth";
import { alerts, decisions, triageRuns } from "@/lib/db/schema";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/alerts/[id]">) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { id } = await ctx.params;
  const [a] = await auth.db.select().from(alerts).where(and(eq(alerts.workspaceId, auth.ws.id), eq(alerts.id, id)));
  if (!a) return json({ error: "Alert not found." }, 404);
  const run = a.latestRunId ? (await auth.db.select().from(triageRuns).where(eq(triageRuns.id, a.latestRunId)))[0] : null;
  const decs = await auth.db.select().from(decisions).where(eq(decisions.alertId, id)).orderBy(asc(decisions.createdAt));
  return json({
    alert_id: a.id,
    external_id: a.externalId,
    status: a.status,
    typology: a.typology,
    created_at: a.createdAt,
    sar_due_at: a.sarDueAt,
    latest_run: run
      ? {
          run_id: run.id,
          recommendation: run.recommendation,
          model_recommendation: run.modelRecommendation,
          confidence: run.confidence,
          risk_score: run.riskScore,
          rationale: run.rationale,
          policy_hits: run.policyHits,
          citations_valid: run.validation.valid,
          model: run.model,
          policy_version: run.policyVersion,
        }
      : null,
    decisions: decs.map((d) => ({ action: d.action, actor_type: d.actorType, actor: d.actorName, reason_code: d.reasonCode, note: d.note, at: d.createdAt })),
  });
}
