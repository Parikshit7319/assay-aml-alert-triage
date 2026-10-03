import { z } from "zod";
import { authenticateApiKey, json } from "@/lib/api-auth";
import { appendAudit } from "@/lib/audit";
import { triageAlert } from "@/lib/engine/run";
import { AlertPayload, ingestAlert } from "@/lib/importer";
import { canRun } from "@/lib/metering";

const Body = z.union([AlertPayload, z.object({ alerts: z.array(AlertPayload).min(1).max(50) })]);

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Invalid request body.", issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) }, 422);
  }
  const items = "alerts" in parsed.data ? parsed.data.alerts : [parsed.data];
  const origin = new URL(req.url).origin;
  const results = [];
  for (const item of items) {
    const alertId = await ingestAlert(auth.db, auth.ws, item, "api");
    if (!alertId) {
      results.push({ external_id: item.alert.external_id, status: "duplicate" });
      continue;
    }
    const allowed = await canRun(auth.db, auth.ws);
    if (!allowed.ok) {
      results.push({ external_id: item.alert.external_id, alert_id: alertId, status: "stored_not_triaged", error: allowed.reason });
      continue;
    }
    try {
      const { runId, result } = await triageAlert(auth.db, auth.ws, alertId, { initiatedBy: `api:${auth.keyName}` });
      results.push({
        external_id: item.alert.external_id,
        alert_id: alertId,
        status: "triaged",
        recommendation: result.recommendation,
        model_recommendation: result.modelRecommendation,
        outcome: result.outcome,
        confidence: result.confidence,
        risk_score: result.riskScore,
        rationale: result.rationale,
        policy_hits: result.policyHits.map((h) => ({ rule: h.rule, effect: h.effect, detail: h.detail })),
        citations_valid: result.validation.valid,
        narrative: result.narrative,
        run_id: runId,
        policy_version: auth.ws.settings.version,
        url: `${origin}/app/alerts/${alertId}`,
      });
    } catch (err) {
      results.push({ external_id: item.alert.external_id, alert_id: alertId, status: "error", error: err instanceof Error ? err.message : "Triage failed" });
    }
  }
  await appendAudit(auth.db, {
    workspaceId: auth.ws.id,
    actorType: "system",
    actorName: `api:${auth.keyName}`,
    action: "api.alerts_received",
    entityType: "api_key",
    entityId: auth.keyId,
    payload: { received: items.length, triaged: results.filter((r) => r.status === "triaged").length },
  });
  return json({ results }, 201);
}
