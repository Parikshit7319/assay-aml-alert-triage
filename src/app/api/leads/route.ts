import { getDb } from "@/lib/db/client";
import { corsHeaders, preflight } from "@/lib/cors";
import { insertLead, parseLead } from "@/lib/leads";
import { MinuteLimiter, clientIp } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const limiter = new MinuteLimiter(5);

export function OPTIONS(req: Request) {
  return preflight(req, "POST, OPTIONS");
}

/**
 * Pilot requests from the static edition (and anyone else on the CORS
 * allowlist). JSON body: { name, email, company, role, alerts_per_month?,
 * segment?, monitoring_system?, message?, website }. "website" is a honeypot.
 */
export async function POST(req: Request) {
  const headers = corsHeaders(req, "POST, OPTIONS");
  if (!limiter.allow(clientIp(req.headers) || "unknown")) {
    return Response.json({ ok: false, error: "Too many requests. Try again in a minute." }, { status: 429, headers });
  }
  let raw: unknown;
  try {
    const body = await req.text();
    if (body.length > 20_000) return Response.json({ ok: false, error: "Request too large." }, { status: 413, headers });
    raw = JSON.parse(body);
  } catch {
    return Response.json({ ok: false, error: "Send the request as JSON." }, { status: 400, headers });
  }
  const parsed = parseLead(raw);
  if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 422, headers });
  try {
    const r = await insertLead(await getDb(), parsed.data);
    if (!r.ok) return Response.json(r, { status: 422, headers });
    return Response.json({ ok: true, message: r.message }, { status: 201, headers });
  } catch (err) {
    console.error("Lead insert failed", err);
    return Response.json({ ok: false, error: "Could not save the request. Email it instead." }, { status: 500, headers });
  }
}
