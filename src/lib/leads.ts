import "server-only";
import { z } from "zod";
import type { DB } from "./db/client";
import { leads } from "./db/schema";
import { newId } from "./util";

/** Thank-you text shared by both pilot forms. */
export const LEAD_THANKS = "Thanks. I will reply within two business days with a short scoping call.";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max * 4)
    .transform((s) => s.slice(0, max));
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => (typeof s === "string" ? s.trim().slice(0, max) : "") || null);

/**
 * One pilot request, as both the server form and the public JSON endpoint send
 * it. Field names follow the JSON API (snake case); the form maps onto them.
 */
export const LeadInput = z.object({
  name: text(120).pipe(z.string().min(1, "Enter your name.")),
  email: text(200).pipe(z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a work email.")),
  company: text(200).pipe(z.string().min(1, "Enter your company.")),
  role: optionalText(120),
  segment: optionalText(60),
  alerts_per_month: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => {
      const n = typeof v === "string" ? (v.trim() ? Number(v.replace(/[, ]/g, "")) : NaN) : v;
      return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 100_000_000) : null;
    }),
  monitoring_system: optionalText(120),
  message: optionalText(2000),
  /** Honeypot. People leave it empty; bots fill it in. */
  website: z
    .string()
    .nullish()
    .transform((s) => (typeof s === "string" ? s.trim() : "")),
});
export type LeadInputData = z.infer<typeof LeadInput>;

export type LeadResult = { ok: true; id: string | null; message: string } | { ok: false; error: string };

const FIELD_MESSAGE: Record<string, string> = {
  name: "Enter your name.",
  email: "Enter a work email.",
  company: "Enter your company.",
};

/** Validation with one readable message, for both the form and the API. */
export function parseLead(raw: unknown): { ok: true; data: LeadInputData } | { ok: false; error: string } {
  const r = LeadInput.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const key = String(r.error.issues[0]?.path[0] ?? "");
  return { ok: false, error: FIELD_MESSAGE[key] ?? "Name, a work email and company are required." };
}

/**
 * Stores a validated pilot request and pings LEAD_WEBHOOK_URL if set. A filled
 * honeypot is acknowledged without storing anything.
 */
export async function insertLead(db: DB, data: LeadInputData): Promise<LeadResult> {
  if (data.website) return { ok: true, id: null, message: LEAD_THANKS };
  const row = {
    id: newId("LEAD"),
    name: data.name,
    email: data.email,
    company: data.company,
    role: data.role,
    segment: data.segment,
    monthlyAlerts: data.alerts_per_month,
    monitoringSystem: data.monitoring_system,
    message: data.message,
  };
  await db.insert(leads).values(row);
  const hook = process.env.LEAD_WEBHOOK_URL;
  if (hook) {
    fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `New pilot request: ${row.name}, ${row.company} (${row.email})`, ...row }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
  return { ok: true, id: row.id, message: LEAD_THANKS };
}
