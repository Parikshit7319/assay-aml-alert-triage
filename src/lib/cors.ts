import { appBaseUrl, vercelOrigins } from "./app-url";

/** The GitHub Pages origin of the static edition. */
export const PAGES_ORIGIN = "https://parikshit7319.github.io";

function originOf(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

/**
 * Origins allowed to call the public endpoints (analytics, pilot requests,
 * public stats) from a browser: this deployment, the static edition on GitHub
 * Pages, and local development.
 */
export function allowedOrigins(env: Record<string, string | undefined> = process.env): Set<string> {
  const list = [
    originOf(env.NEXT_PUBLIC_APP_ORIGIN),
    originOf(env.NEXT_PUBLIC_APP_URL),
    originOf(appBaseUrl(env)),
    ...vercelOrigins(env),
    PAGES_ORIGIN,
    "http://localhost:3000",
    ...(env.CORS_EXTRA_ORIGINS ?? "").split(",").map((o) => originOf(o.trim())),
  ];
  return new Set(list.filter((o): o is string => !!o));
}

/** CORS headers for a response: the request origin is echoed only when it is on the allowlist. */
export function corsHeaders(req: Request, methods = "GET, POST, OPTIONS", env?: Record<string, string | undefined>): Record<string, string> {
  const origin = req.headers.get("origin");
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins(env).has(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = methods;
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

/** Response to an OPTIONS preflight. */
export function preflight(req: Request, methods = "GET, POST, OPTIONS"): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, methods) });
}
