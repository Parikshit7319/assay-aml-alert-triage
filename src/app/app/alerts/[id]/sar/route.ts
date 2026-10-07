import { desc, eq, and } from "drizzle-orm";
import { appendAudit } from "@/lib/audit";
import { alerts, triageRuns } from "@/lib/db/schema";
import { loadBundle } from "@/lib/engine/run";
import { disposition, htmlResponse, withPrintBar } from "@/lib/export-response";
import { buildSarDraft, sarToDocx, sarToPrintHtml, type SarDraftInput } from "@/lib/exports/sar";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * SAR draft for one alert, built from its evidence and the agent's cited
 * rationale and narrative. Word (.docx) by default; ?format=html returns a
 * print-ready page. A draft for investigator review: Assay never files SARs.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTenant();
  if (!t) return new Response("Sign in to export a SAR draft.", { status: 401 });
  const [alert] = await t.db.select().from(alerts).where(and(eq(alerts.id, id), eq(alerts.workspaceId, t.ws.id)));
  if (!alert) return new Response("Alert not found.", { status: 404 });
  const bundle = await loadBundle(t.db, t.ws, id);
  const [run] = alert.latestRunId
    ? await t.db.select().from(triageRuns).where(and(eq(triageRuns.id, alert.latestRunId), eq(triageRuns.workspaceId, t.ws.id)))
    : await t.db.select().from(triageRuns).where(and(eq(triageRuns.alertId, id), eq(triageRuns.workspaceId, t.ws.id))).orderBy(desc(triageRuns.startedAt)).limit(1);

  const rationale = run?.rationale ?? [];
  const cited = new Set(rationale.flatMap((r) => r.citations));
  const txns = [...bundle.history.filter((x) => cited.has(x.id)), ...bundle.transactions];
  const input: SarDraftInput = {
    alertId: alert.id,
    ruleCode: alert.ruleCode,
    ruleDescription: alert.ruleDescription,
    typology: alert.typology,
    createdAt: alert.createdAt.toISOString(),
    customer: {
      id: bundle.customer.id,
      name: bundle.customer.name,
      kind: bundle.customer.kind,
      occupation: bundle.customer.occupation,
      country: bundle.customer.country,
      onboardedAt: bundle.customer.onboardedAt?.toISOString() ?? null,
    },
    transactions: txns.map((x) => ({
      id: x.id,
      ts: x.ts.toISOString(),
      amountCents: x.amountCents,
      direction: x.direction,
      channel: x.channel,
      counterpartyName: x.counterpartyName,
      counterpartyCountry: x.counterpartyCountry,
      branch: x.branch,
    })),
    citedIds: [...cited],
    rationale,
    narrative: run?.narrative ?? "",
    institution: { name: t.ws.name, contact: t.user?.email ?? "" },
  };
  const draft = buildSarDraft(input);
  const format = new URL(req.url).searchParams.get("format") === "html" ? "html" : "docx";

  await appendAudit(t.db, {
    workspaceId: t.ws.id,
    actorType: "human",
    actorName: t.actor,
    action: "sar.draft_exported",
    entityType: "alert",
    entityId: alert.id,
    payload: { format, runId: run?.id ?? null, warnings: draft.warnings.length },
  });

  if (format === "html") {
    return htmlResponse(
      withPrintBar(sarToPrintHtml(draft), { backHref: `/app/alerts/${encodeURIComponent(alert.id)}`, downloadHref: `/app/alerts/${encodeURIComponent(alert.id)}/sar`, downloadLabel: "Download as Word" }),
      `sar-draft-${alert.id}.html`,
      false,
    );
  }
  const blob = await sarToDocx(draft);
  return new Response(blob, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": disposition("attachment", `sar-draft-${alert.id}.docx`),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
