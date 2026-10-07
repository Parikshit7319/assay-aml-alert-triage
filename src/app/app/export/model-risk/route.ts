import { htmlResponse, withPrintBar } from "@/lib/export-response";
import { buildModelRiskPack } from "@/lib/exports/model-risk";
import { modelRiskInput } from "@/lib/reports";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * The model risk documentation pack as a standalone, print-ready HTML page
 * built from live policy, run and QA data. ?download=1 saves the .html file.
 */
export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return new Response("Sign in to open the model risk pack.", { status: 401 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const html = buildModelRiskPack(await modelRiskInput(t.db, t.ws));
  const filename = `model-risk-pack-${t.ws.id}-v${t.ws.settings.version}.html`;
  if (download) return htmlResponse(html, filename, true);
  return htmlResponse(withPrintBar(html, { backHref: "/app/settings", downloadHref: "/app/export/model-risk?download=1", downloadLabel: "Download as HTML" }), filename, false);
}
