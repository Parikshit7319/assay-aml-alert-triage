import { asc, eq } from "drizzle-orm";
import { verifyChain } from "@/lib/audit";
import { auditEvents } from "@/lib/db/schema";
import { jsonResponse } from "@/lib/export-response";
import { auditToJson } from "@/lib/exports/csv";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Full audit log with chain verification, for an examiner or a SIEM. Same auth as the rest of the workbench. */
export async function GET() {
  const t = await getTenant();
  if (!t) return new Response("Sign in to export the audit log.", { status: 401 });
  const [rows, chain] = await Promise.all([
    t.db.select().from(auditEvents).where(eq(auditEvents.workspaceId, t.ws.id)).orderBy(asc(auditEvents.seq)),
    verifyChain(t.db, t.ws.id),
  ]);
  const json = auditToJson(rows, { workspaceName: t.ws.name, workspaceId: t.ws.id, exportedBy: t.actor, chain });
  return jsonResponse(json, `audit-${t.ws.id}-${new Date().toISOString().slice(0, 10)}.json`);
}
