import { asc, eq } from "drizzle-orm";
import { verifyChain } from "@/lib/audit";
import { auditEvents } from "@/lib/db/schema";
import { csvResponse, jsonResponse } from "@/lib/export-response";
import { auditToCsv, auditToJson } from "@/lib/exports/csv";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Audit log export. ?format=csv (default) or ?format=json; JSON includes the chain check and hashing rules. */
export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return new Response("Sign in to export the audit log.", { status: 401 });
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const rows = await t.db.select().from(auditEvents).where(eq(auditEvents.workspaceId, t.ws.id)).orderBy(asc(auditEvents.seq));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    const chain = await verifyChain(t.db, t.ws.id);
    return jsonResponse(auditToJson(rows, { workspaceName: t.ws.name, workspaceId: t.ws.id, exportedBy: t.actor, chain }), `audit-${t.ws.id}-${stamp}.json`);
  }
  return csvResponse(auditToCsv(rows), `audit-${t.ws.id}-${stamp}.csv`);
}
