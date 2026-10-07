import { describe, expect, it } from "vitest";
import {
  cleanReferrer,
  clientIp,
  dailySalt,
  deviceFromWidth,
  fillDays,
  isBot,
  MinuteLimiter,
  normalizePath,
  parseTrackBody,
  rate,
  visitorHash,
} from "@/lib/analytics";
import { appBaseUrl } from "@/lib/app-url";
import { allowedOrigins, corsHeaders } from "@/lib/cors";

describe("analytics helpers", () => {
  it("parses the beacon body sent by analytics-client", () => {
    const raw = JSON.stringify({ event: "pageview", path: "/pricing", label: undefined, referrer: "news.ycombinator.com", w: 1440 });
    expect(parseTrackBody(raw)).toMatchObject({ event: "pageview", path: "/pricing", referrer: "news.ycombinator.com", w: 1440 });
    expect(parseTrackBody(JSON.stringify({ event: "demo_start", path: "/demo/", referrer: null }))).toMatchObject({ event: "demo_start" });
    expect(parseTrackBody(JSON.stringify({ event: "hack", path: "/" }))).toBeNull();
    expect(parseTrackBody("not json")).toBeNull();
    expect(parseTrackBody("x".repeat(5000))).toBeNull();
    expect(parseTrackBody(JSON.stringify({ event: "click", path: "/", label: "x".repeat(81) }))).toBeNull();
  });

  it("normalizes paths from both editions", () => {
    expect(normalizePath("/assay-aml-alert-triage/pricing/")).toBe("/pricing");
    expect(normalizePath("/assay-aml-alert-triage/")).toBe("/");
    expect(normalizePath("/assay-aml-alert-triage")).toBe("/");
    expect(normalizePath("/pricing?ref=x#top")).toBe("/pricing");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("demo")).toBe("/demo");
    expect(normalizePath("/assay-aml-alert-triage-old/x")).toBe("/assay-aml-alert-triage-old/x");
  });

  it("classifies devices by viewport width", () => {
    expect(deviceFromWidth(390)).toBe("mobile");
    expect(deviceFromWidth(768)).toBe("tablet");
    expect(deviceFromWidth(1099)).toBe("tablet");
    expect(deviceFromWidth(1440)).toBe("desktop");
    expect(deviceFromWidth(null)).toBeNull();
    expect(deviceFromWidth(0)).toBeNull();
  });

  it("hashes visitors to 16 hex characters with a salt that changes daily", () => {
    const d1 = new Date("2026-10-07T01:00:00Z");
    const d1b = new Date("2026-10-07T23:59:00Z");
    const d2 = new Date("2026-10-08T00:00:01Z");
    expect(dailySalt("s", d1)).toBe(dailySalt("s", d1b));
    expect(dailySalt("s", d1)).not.toBe(dailySalt("s", d2));
    expect(dailySalt("s", d1)).not.toBe(dailySalt("t", d1));
    const v = visitorHash(dailySalt("s", d1), "203.0.113.9", "Mozilla/5.0");
    expect(v).toMatch(/^[0-9a-f]{16}$/);
    expect(visitorHash(dailySalt("s", d1), "203.0.113.9", "Mozilla/5.0")).toBe(v);
    expect(visitorHash(dailySalt("s", d2), "203.0.113.9", "Mozilla/5.0")).not.toBe(v);
    expect(v).not.toContain("203");
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("");
  });

  it("cleans referrers and spots bots", () => {
    expect(cleanReferrer("WWW.LinkedIn.com")).toBe("linkedin.com");
    expect(cleanReferrer("evil<script>")).toBeNull();
    expect(cleanReferrer(null)).toBeNull();
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15")).toBe(false);
  });

  it("rate-limits per key per minute", () => {
    const l = new MinuteLimiter(3);
    const t = Date.UTC(2026, 9, 7, 12, 0, 5);
    expect([1, 2, 3, 4].map(() => l.allow("a", t))).toEqual([true, true, true, false]);
    expect(l.allow("b", t)).toBe(true);
    expect(l.allow("a", t + 60_000)).toBe(true);
  });

  it("fills a 30-day series with zeros", () => {
    const now = new Date("2026-10-07T15:00:00Z");
    const pts = fillDays([{ day: "2026-10-07", views: 5, visitors: 2 }, { day: "2026-09-08", views: 1, visitors: 1 }, { day: "2026-09-01", views: 9, visitors: 9 }], 30, now);
    expect(pts).toHaveLength(30);
    expect(pts[0]).toEqual({ day: "2026-09-08", views: 1, visitors: 1 });
    expect(pts[29]).toEqual({ day: "2026-10-07", views: 5, visitors: 2 });
    expect(pts[1]).toEqual({ day: "2026-09-09", views: 0, visitors: 0 });
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(1, 0)).toBeNull();
  });
});

describe("CORS allowlist", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://assay.example", NEXT_PUBLIC_APP_ORIGIN: "https://app.assay.example/", VERCEL_URL: "assay-git-x.vercel.app" };

  it("allows this deployment, GitHub Pages and local development only", () => {
    const o = allowedOrigins(env);
    expect(o.has("https://assay.example")).toBe(true);
    expect(o.has("https://app.assay.example")).toBe(true);
    expect(o.has("https://assay-git-x.vercel.app")).toBe(true);
    expect(o.has("https://parikshit7319.github.io")).toBe(true);
    expect(o.has("http://localhost:3000")).toBe(true);
    expect(o.has("https://evil.example")).toBe(false);
  });

  it("echoes an allowed origin and omits the header otherwise", () => {
    const ok = corsHeaders(new Request("https://assay.example/api/track", { headers: { origin: "https://parikshit7319.github.io" } }), "POST, OPTIONS", env);
    expect(ok["Access-Control-Allow-Origin"]).toBe("https://parikshit7319.github.io");
    expect(ok["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    const no = corsHeaders(new Request("https://assay.example/api/track", { headers: { origin: "https://evil.example" } }), "POST, OPTIONS", env);
    expect(no["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(no.Vary).toBe("Origin");
  });
});

describe("appBaseUrl", () => {
  it("prefers explicit settings, then Vercel's production domain, then the deployment URL", () => {
    expect(appBaseUrl({ BETTER_AUTH_URL: "https://a.example/", NEXT_PUBLIC_APP_URL: "https://b.example" })).toBe("https://a.example");
    expect(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://b.example" })).toBe("https://b.example");
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "assay.vercel.app", VERCEL_URL: "assay-abc.vercel.app" })).toBe("https://assay.vercel.app");
    expect(appBaseUrl({ VERCEL_URL: "assay-abc.vercel.app" })).toBe("https://assay-abc.vercel.app");
    expect(appBaseUrl({})).toBe("http://localhost:3000");
  });
});
