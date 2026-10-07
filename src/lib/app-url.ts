/**
 * Public base URL of the server edition, without a trailing slash. Explicit
 * settings win; on Vercel it falls back to the production domain, then to the
 * deployment's own URL, so a fresh deploy works before anyone sets a variable.
 */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Origins the server edition answers to on Vercel (production domain, this deployment, its branch alias). */
export function vercelOrigins(env: Record<string, string | undefined> = process.env): string[] {
  return [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter((h): h is string => !!h).map((h) => `https://${h}`);
}
