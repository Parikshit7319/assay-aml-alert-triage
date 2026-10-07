// Assay public API for the static GitHub Pages edition, deployed as a Neon Function.
// Three routes, the same contracts as the server edition:
//   POST /api/leads          pilot requests from the static site
//   POST /api/track          first-party page views (no cookies, no IP stored)
//   GET  /api/public/stats   real counts for the design partner block
// No dependencies: Postgres is reached over Neon's SQL-over-HTTP endpoint with
// the DATABASE_URL Neon injects into every function.

const ALLOWED_ORIGINS = new Set(["https://parikshit7319.github.io", "http://localhost:3000", "http://localhost:3300"]);
const LEAD_THANKS = "Thanks. I will reply within two business days with a short scoping call.";
const enc = new TextEncoder();

function cors(origin) {
  const h = { Vary: "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
const json = (body, status, origin, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin), ...extra } });

async function sql(query, params = []) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Neon-Connection-String": url, "Neon-Raw-Text-Output": "true" },
    body: JSON.stringify({ query, params }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`SQL ${res.status}: ${data?.message ?? "no body"}`);
  return data.rows ?? [];
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function newId(prefix, length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return `${prefix}-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

// Naive per-isolate rate limits; enough to blunt a form spammer.
const hits = new Map();
function limited(key, max) {
  const minute = Math.floor(Date.now() / 60_000);
  const k = `${key}:${minute}`;
  const n = (hits.get(k) ?? 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) hits.clear();
  return n > max;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v, max) => str(v, max) || null;
const clientIp = (req) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

async function leads(req, origin) {
  if (limited(`lead:${clientIp(req)}`, 5)) return json({ ok: false, error: "Too many requests. Try again in a minute." }, 429, origin);
  let b;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: "Send JSON." }, 400, origin);
  }
  if (str(b.website, 200)) return json({ ok: true, message: LEAD_THANKS }, 201, origin); // honeypot
  const name = str(b.name, 120);
  const email = str(b.email, 200);
  const company = str(b.company, 200);
  if (!name) return json({ ok: false, error: "Enter your name." }, 400, origin);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "Enter a work email." }, 400, origin);
  if (!company) return json({ ok: false, error: "Enter your company." }, 400, origin);
  const rawAlerts = typeof b.alerts_per_month === "string" ? Number(b.alerts_per_month.replace(/[, ]/g, "")) : b.alerts_per_month;
  const alerts = typeof rawAlerts === "number" && Number.isFinite(rawAlerts) && rawAlerts >= 0 ? Math.min(Math.round(rawAlerts), 100_000_000) : null;
  await sql(
    `insert into leads (id, name, email, company, role, segment, monthly_alerts, monitoring_system, message) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [newId("LEAD"), name, email, company, opt(b.role, 120), opt(b.segment, 60), alerts, opt(b.monitoring_system, 120), opt(b.message, 2000)],
  );
  return json({ ok: true, message: LEAD_THANKS }, 201, origin);
}

const EVENTS = new Set(["pageview", "click", "demo_start", "demo_action", "pilot_submit", "signup"]);
async function track(req, origin) {
  const ip = clientIp(req);
  if (limited(`track:${ip}`, 120)) return new Response(null, { status: 204, headers: cors(origin) });
  let b;
  try {
    b = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (!EVENTS.has(b?.event)) return new Response(null, { status: 204, headers: cors(origin) });
  const ua = req.headers.get("user-agent") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  // Daily-rotating salted hash: counts unique visitors per day, cannot be reversed to an IP.
  const visitor = (await sha256Hex(`${process.env.ANALYTICS_SALT ?? "assay"}:${day}:${ip}:${ua}`)).slice(0, 16);
  const w = Number(b.w);
  const device = !Number.isFinite(w) ? null : w < 768 ? "mobile" : w < 1100 ? "tablet" : "desktop";
  await sql(`insert into analytics_events (event, path, label, referrer_host, device, visitor) values ($1, $2, $3, $4, $5, $6)`, [
    b.event,
    str(b.path, 200) || "/",
    opt(b.label, 80),
    opt(b.referrer, 200),
    device,
    visitor,
  ]);
  return new Response(null, { status: 204, headers: cors(origin) });
}

let statsCache = null;
async function stats(origin) {
  if (!statsCache || Date.now() - statsCache.at > 10 * 60_000) {
    const [row] = await sql(
      `select (select count(*) from leads) as leads,
              (select count(*) from analytics_events where event = 'demo_start' and ts > now() - interval '7 days') as demos,
              (select count(*) from triage_runs) as runs`,
    );
    statsCache = { at: Date.now(), body: { pilotRequests: Number(row?.leads ?? 0), demoSessions7d: Number(row?.demos ?? 0), alertsTriagedTotal: Number(row?.runs ?? 0), asOf: new Date().toISOString() } };
  }
  return json(statsCache.body, 200, origin, { "Cache-Control": "public, max-age=600" });
}

export default {
  async fetch(req) {
    const origin = req.headers.get("origin");
    const { pathname } = new URL(req.url);
    const path = pathname.replace(/\/+$/, "") || "/";
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
      if (path === "/api/leads" && req.method === "POST") return await leads(req, origin);
      if (path === "/api/track" && req.method === "POST") return await track(req, origin);
      if (path === "/api/public/stats" && req.method === "GET") return await stats(origin);
      if (path === "/" || path === "/api/health") return json({ ok: true, service: "assay-public-api", routes: ["POST /api/leads", "POST /api/track", "GET /api/public/stats"] }, 200, origin);
      return json({ ok: false, error: "Not found" }, 404, origin);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: "Something went wrong on our side. Email parikshit.ambhore@rice.edu instead." }, 500, origin);
    }
  },
};
