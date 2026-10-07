import "server-only";
import { createHash } from "node:crypto";

const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret";
let warned = false;

/**
 * The auth signing secret. BETTER_AUTH_SECRET wins. In production without it,
 * a stable secret is derived from DATABASE_URL so a one-click deploy signs
 * sessions consistently across instances and restarts; set the variable to
 * rotate it independently of the database password.
 */
export function authSecret(): string {
  const explicit = process.env.BETTER_AUTH_SECRET;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    if (!warned) {
      warned = true;
      console.warn("BETTER_AUTH_SECRET is not set: deriving one from DATABASE_URL. Set BETTER_AUTH_SECRET (openssl rand -base64 32) to manage it yourself.");
    }
    return createHash("sha256").update(`assay-auth:${process.env.DATABASE_URL ?? ""}`).digest("hex");
  }
  return DEV_SECRET;
}
