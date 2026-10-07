/**
 * First-party analytics helpers. Pure apart from node:crypto, so they can be
 * unit tested. Nothing here keeps an IP address or a user agent: they go into
 * a salted hash that changes every UTC day and is cut to 16 hex characters.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const TRACK_EVENTS = ["pageview", "click", "demo_start", "demo_action", "pilot_submit", "signup"] as const;
export type TrackEventName = (typeof TRACK_EVENTS)[number];

/** The beacon body sent by src/lib/analytics-client.ts. */
export const TrackBody = z.object({
  event: z.enum(TRACK_EVENTS),
  path: z.string().max(400).optional().default("/"),
  label: z.string().max(80).nullish(),
  referrer: z.string().max(253).nullish(),
  w: z.number().int().min(0).max(20000).nullish(),
});
export type TrackBodyInput = z.infer<typeof TrackBody>;

/** Parses a text/plain or JSON beacon body. Returns null when it is not valid. */
export function parseTrackBody(raw: string): TrackBodyInput | null {
  if (!raw || raw.length > 4096) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = TrackBody.safeParse(json);
  return r.success ? r.data : null;
}

/** Static-edition base path, stripped so both editions report the same paths. */
export const PAGES_BASE_PATH = "/assay-aml-alert-triage";

/** "/assay-aml-alert-triage/pricing/?x=1" and "/pricing" both become "/pricing". */
export function normalizePath(path: string, basePath = PAGES_BASE_PATH): string {
  let p = (path || "/").split(/[?#]/)[0] || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (basePath && (p === basePath || p.startsWith(`${basePath}/`))) p = p.slice(basePath.length) || "/";
  if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
  return p.slice(0, 200);
}

export type Device = "mobile" | "tablet" | "desktop";

/** Coarse device class from the viewport width; null when the client did not send one. */
export function deviceFromWidth(w: number | null | undefined): Device | null {
  if (w == null || !Number.isFinite(w) || w <= 0) return null;
  if (w < 768) return "mobile";
  if (w < 1100) return "tablet";
  return "desktop";
}

/** A referrer host, lower-cased, or null when it is missing or not a plausible host name. */
export function cleanReferrer(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const h = ref.trim().toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9.-]+(:\d+)?$/.test(h) && h.length <= 253 ? h : null;
}

/** Salt for one UTC day, derived from the auth secret so it is never stored. */
export function dailySalt(secret: string, now = new Date()): string {
  return createHash("sha256").update(`assay-analytics:${secret}:${now.toISOString().slice(0, 10)}`).digest("hex");
}

/** sha256(salt + ip + user agent), first 16 hex characters. */
export function visitorHash(salt: string, ip: string, userAgent: string): string {
  return createHash("sha256").update(salt).update(ip).update(userAgent).digest("hex").slice(0, 16);
}

/** First address in X-Forwarded-For, else X-Real-IP, else an empty string. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() ?? "";
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|preview/i;
export function isBot(userAgent: string): boolean {
  return !userAgent || BOT.test(userAgent);
}

/**
 * Naive fixed-window limiter per key, in memory. Good enough to stop one
 * client flooding one instance; not shared across instances.
 */
export class MinuteLimiter {
  private hits = new Map<string, { window: number; n: number }>();
  constructor(private readonly limit: number) {}

  allow(key: string, now = Date.now()): boolean {
    const window = Math.floor(now / 60_000);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.window !== window) this.hits.delete(k);
    }
    const cur = this.hits.get(key);
    if (!cur || cur.window !== window) {
      this.hits.set(key, { window, n: 1 });
      return true;
    }
    cur.n++;
    return cur.n <= this.limit;
  }
}

export interface DayPoint {
  day: string; // YYYY-MM-DD, UTC
  views: number;
  visitors: number;
}

/** One point per UTC day for the last `days` days ending today, zeros where nothing was recorded. */
export function fillDays(rows: readonly { day: string; views: number; visitors: number }[], days: number, now = new Date()): DayPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, views: Number(r?.views ?? 0), visitors: Number(r?.visitors ?? 0) });
  }
  return out;
}

/** Share of `part` in `whole`, or null when there is no whole. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
