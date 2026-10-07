import { asc, eq } from "drizzle-orm";
import { alerts, decisions } from "@/lib/db/schema";
import { csvResponse } from "@/lib/export-response";
import { decisionsToCsv } from "@/lib/exports/csv";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Every decision in the workspace: analyst, batch, auto-close and SAR, with reason codes and agreement. */
export async function GET() {
  const t = await getTenant();
  if (!t) return new Response("Sign in to export decisions.", { status: 401 });
  const rows = await t.db
    .select({ d: decisions, typology: alerts.typology })
    .from(decisions)
    .innerJoin(alerts, eq(alerts.id, decisions.alertId))
    .where(eq(decisions.workspaceId, t.ws.id))
    .orderBy(asc(decisions.createdAt));
  const csv = decisionsToCsv(rows.map(({ d, typology }) => ({ ...d, typology })));
  return csvResponse(csv, `decisions-${t.ws.id}-${new Date().toISOString().slice(0, 10)}.csv`);
}
