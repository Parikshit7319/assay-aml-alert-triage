import { analyticsEvents } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { cleanReferrer, clientIp, dailySalt, deviceFromWidth, isBot, MinuteLimiter, normalizePath, parseTrackBody, visitorHash } from "@/lib/analytics";
import { corsHeaders, preflight } from "@/lib/cors";
import { authSecret } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const limiter = new MinuteLimiter(60);

export function OPTIONS(req: Request) {
  return preflight(req, "POST, OPTIONS");
}

/**
 * First-party analytics beacon. Accepts the text/plain (sendBeacon) or JSON
 * body from analytics-client.ts and always answers 204, so a page never sees
 * an error. Stores event, normalized path, label, referrer host, device class
 * and a daily visitor hash. Never the IP or the user agent.
 */
export async function POST(req: Request) {
  const headers = corsHeaders(req, "POST, OPTIONS");
  const done = () => new Response(null, { status: 204, headers });
  try {
    // Honor Do Not Track and Global Privacy Control on the server too.
    if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") return done();
    const ua = req.headers.get("user-agent") ?? "";
    if (isBot(ua)) return done();
    const body = parseTrackBody(await req.text());
    if (!body) return done();
    const visitor = visitorHash(dailySalt(authSecret()), clientIp(req.headers), ua);
    if (!limiter.allow(visitor)) return done();
    const db = await getDb();
    await db.insert(analyticsEvents).values({
      event: body.event,
      path: normalizePath(body.path),
      label: body.label?.slice(0, 80) || null,
      referrerHost: cleanReferrer(body.referrer),
      device: deviceFromWidth(body.w),
      visitor,
    });
  } catch (err) {
    console.error("Analytics event dropped", err);
  }
  return done();
}
