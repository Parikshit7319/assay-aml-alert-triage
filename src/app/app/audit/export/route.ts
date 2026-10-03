import { asc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { auditEvents } from "@/lib/db/schema";
import { getTenant } from "@/lib/tenant";

export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return new Response("Sign in to export the audit log.", { status: 401 });
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const rows = await t.db.select().from(auditEvents).where(eq(auditEvents.workspaceId, t.ws.id)).orderBy(asc(auditEvents.seq));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify({ workspaceId: t.ws.id, exportedAt: new Date().toISOString(), hashAlgorithm: "sha256(prevHash + canonicalJson(event))", events: rows }, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="audit-${t.ws.id}-${stamp}.json"` },
    });
  }
  const csv = Papa.unparse(
    rows.map((r) => ({ seq: r.seq, ts: r.ts.toISOString(), actor_type: r.actorType, actor: r.actorName, action: r.action, entity_type: r.entityType, entity_id: r.entityId, payload: JSON.stringify(r.payload), prev_hash: r.prevHash, hash: r.hash })),
  );
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="audit-${t.ws.id}-${stamp}.csv"` } });
}
