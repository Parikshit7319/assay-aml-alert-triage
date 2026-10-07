/**
 * Browser CSV import helpers for the demo: the downloadable template and a
 * readable shape for parser errors. Pure.
 */
import Papa from "papaparse";
import { CSV_COLUMNS, MAX_CSV_ALERTS } from "@/lib/import-schema";
import type { Scenario } from "@/lib/demo/scenarios";
import type { Typology } from "@/lib/db/schema";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export { MAX_CSV_ALERTS };

type Column = (typeof CSV_COLUMNS)[number];

/**
 * A template with the full column layout and three synthetic example rows:
 * one structuring alert with three cash deposits just under $10,000.
 * Every name and id is invented.
 */
export function buildTemplateCsv(now: Date = new Date()): string {
  const iso = (daysAgo: number, hour = 12) => {
    const d = new Date(now.getTime() - daysAgo * 86_400_000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const alert: Partial<Record<Column, string>> = {
    alert_id: "TM-100231",
    rule_code: "CASH-STRUCT-01",
    rule_description: "Three or more cash deposits between $8,000 and $10,000 within 30 days",
    typology: "structuring",
    alert_created_at: iso(0, 14),
    customer_id: "CUST-55102",
    customer_name: "Sample Customer A",
    customer_type: "individual",
    occupation: "Food truck owner",
    country: "US",
    onboarded_at: iso(500),
    risk_rating: "medium",
    expected_monthly_volume: "6000",
    kyc_notes: "Synthetic example row. Replace with your own export.",
  };
  const deposits: [string, number, number, string][] = [
    ["TX-A1", 9, 9200, "Main St location"],
    ["TX-A2", 7, 9650, "Oak Ave location"],
    ["TX-A3", 4, 9800, "Harbor location"],
  ];
  const rows = deposits.map(([id, daysAgo, amount, location]) => ({
    ...alert,
    txn_id: id,
    txn_timestamp: iso(daysAgo, 10),
    amount: String(amount),
    direction: "in",
    channel: "cash",
    location,
    triggered: "Y",
  }));
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows.map((r) => CSV_COLUMNS.map((c) => (r as Partial<Record<Column, string>>)[c] ?? "")) });
}

export interface ImportErrorRow {
  /** "Row 4", "Alert TM-100231", or "File". */
  where: string;
  problem: string;
}

/** Splits parser messages like "Alert TM-1: customer.name Required." into a location and a problem. */
export function toErrorRows(errors: readonly string[]): ImportErrorRow[] {
  return errors.map((e) => {
    const m = /^(Row \d+|Alert [^:]+):\s*(.*)$/.exec(e.trim());
    return m ? { where: m[1], problem: m[2] } : { where: "File", problem: e.trim() };
  });
}

export interface TypologyCount {
  typology: Typology;
  alerts: number;
  transactions: number;
}

/** Alerts and transactions per typology, largest first. */
export function countByTypology(scenarios: readonly Scenario[]): TypologyCount[] {
  const map = new Map<Typology, TypologyCount>();
  for (const s of scenarios) {
    const t = s.alert.typology;
    const row = map.get(t) ?? { typology: t, alerts: 0, transactions: 0 };
    row.alerts++;
    row.transactions += s.transactions.length;
    map.set(t, row);
  }
  return [...map.values()].sort((a, b) => b.alerts - a.alerts || a.typology.localeCompare(b.typology));
}

/** "File too large" style checks before reading. Returns an error message or null. */
export function checkImportFile(file: { name: string; size: number; type?: string }): string | null {
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv" || file.type === "application/vnd.ms-excel";
  if (!isCsv) return `${file.name} is not a CSV file. Export your alerts as .csv, or start from the template.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_IMPORT_BYTES) return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The demo takes files up to 2 MB; larger volumes go through the API.`;
  return null;
}
