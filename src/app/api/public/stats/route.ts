import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyticsEvents, leads, triageRuns } from "@/lib/db/schema";
import { corsHeaders, preflight } from "@/lib/cors";
import { DAY } from "@/lib/util";

export const dynamic = "force-dynamic";

export interface PublicStats {
  /** Pilot requests received (rows in leads). */
  pilotRequests: number;
  /** demo_start analytics events in the last 7 days. */
  demoSessions7d: number;
  /** Triage runs across every workspace, demo workspaces included. */
  alertsTriagedTotal: number;
  /** ISO time the numbers were counted. */
  asOf: string;
}

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: PublicStats } | null = null;

async function count(): Promise<PublicStats> {
  const db = await getDb();
  const [[l], [d], [r]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(leads),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.event, "demo_start"), gte(analyticsEvents.ts, new Date(Date.now() - 7 * DAY)))),
    db.select({ n: sql<number>`count(*)::int` }).from(triageRuns),
  ]);
  return { pilotRequests: Number(l?.n ?? 0), demoSessions7d: Number(d?.n ?? 0), alertsTriagedTotal: Number(r?.n ?? 0), asOf: new Date().toISOString() };
}

export function OPTIONS(req: Request) {
  return preflight(req, "GET, OPTIONS");
}

/** Real counts for the marketing site. Cached in memory and at the edge for 10 minutes. */
export async function GET(req: Request) {
  const headers = { ...corsHeaders(req, "GET, OPTIONS"), "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600" };
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), data: await count() };
    return Response.json(cache.data, { headers });
  } catch (err) {
    console.error("Public stats failed", err);
    return Response.json({ error: "Stats are unavailable right now." }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
