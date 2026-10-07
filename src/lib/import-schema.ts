/**
 * Pure, browser-safe parts of the alert importer: the payload schema, the CSV
 * layout and the CSV-to-payload rules. No database, no server-only imports, so
 * the public demo can parse an uploaded CSV in the browser with the same rules
 * the product uses.
 */
import Papa from "papaparse";
import { z } from "zod";
import type { Typology } from "@/lib/db/schema";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 date");

export const AlertPayload = z.object({
  alert: z.object({
    external_id: z.string().min(1).max(120),
    rule_code: z.string().min(1).max(60),
    rule_description: z.string().max(300).optional(),
    typology: z.enum(["structuring", "funnel_account", "high_risk_wire", "sanctions_name", "payroll_pattern", "seasonal_cash", "other"]).optional(),
    created_at: isoDate.optional(),
    triggered_transaction_ids: z.array(z.string()).max(500).optional(),
  }),
  customer: z.object({
    external_id: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    type: z.enum(["individual", "business"]),
    occupation: z.string().max(200).optional(),
    country: z.string().length(2).optional(),
    onboarded_at: isoDate.optional(),
    risk_rating: z.enum(["low", "medium", "high"]).optional(),
    expected_monthly_volume: z.number().nonnegative().optional(),
    kyc_notes: z.string().max(2000).optional(),
  }),
  transactions: z
    .array(
      z.object({
        external_id: z.string().min(1).max(120),
        timestamp: isoDate,
        amount: z.number().positive(),
        currency: z.string().length(3).optional(),
        direction: z.enum(["in", "out"]),
        channel: z.enum(["cash", "wire", "ach", "p2p", "card", "check"]),
        counterparty_name: z.string().max(200).optional(),
        counterparty_country: z.string().length(2).optional(),
        location: z.string().max(120).optional(),
        memo: z.string().max(500).optional(),
      }),
    )
    .max(5000),
  prior_cases: z
    .array(z.object({ kind: z.enum(["alert", "sar"]), opened_at: isoDate, outcome: z.string().max(120), summary: z.string().max(1000) }))
    .max(200)
    .optional(),
});
export type AlertPayload = z.infer<typeof AlertPayload>;

export function inferTypology(ruleCode: string, description = ""): Typology {
  const s = `${ruleCode} ${description}`.toLowerCase();
  if (/struct|ctr|below.?threshold/.test(s)) return "structuring";
  if (/funnel|p2p|many senders|pass.?through/.test(s)) return "funnel_account";
  if (/sanction|watchlist|ofac|\bwl\b|name/.test(s)) return "sanctions_name";
  if (/geo|high.?risk|jurisdiction/.test(s) && /wire/.test(s)) return "high_risk_wire";
  if (/payroll|ach.?vol/.test(s)) return "payroll_pattern";
  if (/season|cash.?vol/.test(s)) return "seasonal_cash";
  return "other";
}

export const CSV_COLUMNS = [
  "alert_id",
  "rule_code",
  "rule_description",
  "typology",
  "alert_created_at",
  "customer_id",
  "customer_name",
  "customer_type",
  "occupation",
  "country",
  "onboarded_at",
  "risk_rating",
  "expected_monthly_volume",
  "kyc_notes",
  "txn_id",
  "txn_timestamp",
  "amount",
  "direction",
  "channel",
  "counterparty_name",
  "counterparty_country",
  "location",
  "memo",
  "triggered",
] as const;

export const REQUIRED_CSV_COLUMNS = ["alert_id", "rule_code", "customer_id", "customer_name", "txn_id", "txn_timestamp", "amount", "direction", "channel"] as const;

/** Most alerts one CSV file may carry. Larger volumes go through the API. */
export const MAX_CSV_ALERTS = 200;

const num = (v: string | undefined) => (v == null || v.trim() === "" ? undefined : Number(v.replace(/[$,]/g, "")));
const opt = (v: string | undefined) => (v == null || v.trim() === "" ? undefined : v.trim());

/**
 * Parses the one-row-per-transaction CSV and groups rows by alert_id into
 * validated payloads. Same column checks, grouping and row rules as
 * importAlertsCsv. Alerts that fail validation are reported in `errors` and
 * skipped; the rest are returned.
 */
export function parseAlertCsv(text: string): { payloads: AlertPayload[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const errors: string[] = [];
  if (parsed.errors.length) errors.push(...parsed.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}.`));
  const fields = parsed.meta.fields?.map((f) => f.toLowerCase()) ?? [];
  const missing = REQUIRED_CSV_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length) return { payloads: [], errors: [`Missing required columns: ${missing.join(", ")}. Download the template for the expected layout.`] };

  const groups = new Map<string, Record<string, string>[]>();
  parsed.data.forEach((r) => {
    const k = opt(r.alert_id);
    if (!k) return;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  if (groups.size > MAX_CSV_ALERTS) return { payloads: [], errors: [`Import up to ${MAX_CSV_ALERTS} alerts per file. Use the API for larger volumes.`] };

  const payloads: AlertPayload[] = [];
  for (const [alertExt, rows] of groups) {
    const first = rows[0];
    const payload = {
      alert: {
        external_id: alertExt,
        rule_code: opt(first.rule_code) ?? "",
        rule_description: opt(first.rule_description),
        typology: opt(first.typology) as Typology | undefined,
        created_at: opt(first.alert_created_at),
        triggered_transaction_ids: rows.filter((r) => /^(y|yes|true|1)$/i.test(r.triggered ?? "")).map((r) => r.txn_id),
      },
      customer: {
        external_id: opt(first.customer_id) ?? "",
        name: opt(first.customer_name) ?? "",
        type: (opt(first.customer_type) ?? "individual").toLowerCase(),
        occupation: opt(first.occupation),
        country: opt(first.country)?.toUpperCase(),
        onboarded_at: opt(first.onboarded_at),
        risk_rating: opt(first.risk_rating)?.toLowerCase(),
        expected_monthly_volume: num(first.expected_monthly_volume),
        kyc_notes: opt(first.kyc_notes),
      },
      transactions: rows.map((r) => ({
        external_id: opt(r.txn_id) ?? "",
        timestamp: opt(r.txn_timestamp) ?? "",
        amount: num(r.amount) ?? 0,
        direction: (opt(r.direction) ?? "").toLowerCase(),
        channel: (opt(r.channel) ?? "").toLowerCase(),
        counterparty_name: opt(r.counterparty_name),
        counterparty_country: opt(r.counterparty_country)?.toUpperCase(),
        location: opt(r.location),
        memo: opt(r.memo),
      })),
    };
    const result = AlertPayload.safeParse(payload);
    if (!result.success) {
      const issue = result.error.issues[0];
      errors.push(`Alert ${alertExt}: ${issue.path.join(".")} ${issue.message}.`);
      continue;
    }
    payloads.push(result.data);
  }
  return { payloads, errors };
}
