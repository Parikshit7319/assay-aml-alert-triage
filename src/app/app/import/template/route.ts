import Papa from "papaparse";
import { CSV_COLUMNS } from "@/lib/importer";

/** Two synthetic example alerts: a structuring pattern and a payroll false positive. */
export function GET() {
  const now = Date.now();
  const iso = (daysAgo: number, h = 12) => new Date(now - daysAgo * 86_400_000 + (h - 12) * 3_600_000).toISOString();
  const rows: Record<(typeof CSV_COLUMNS)[number], string>[] = [];
  const s = {
    alert_id: "TM-100231",
    rule_code: "CASH-STRUCT-01",
    rule_description: "Three or more cash deposits between $8,000 and $10,000 within 30 days",
    typology: "structuring",
    alert_created_at: iso(0),
    customer_id: "CUST-55102",
    customer_name: "Sample Customer A",
    customer_type: "individual",
    occupation: "Food truck owner",
    country: "US",
    onboarded_at: iso(500),
    risk_rating: "medium",
    expected_monthly_volume: "6000",
    kyc_notes: "",
  };
  const deposits = [
    [9, 9200, "Main St location"],
    [7, 9650, "Oak Ave location"],
    [7, 9400, "Main St location"],
    [4, 9800, "Harbor location"],
  ] as const;
  deposits.forEach(([d, amt, loc], i) => rows.push({ ...s, txn_id: `TX-A${i + 1}`, txn_timestamp: iso(d, 10 + i), amount: String(amt), direction: "in", channel: "cash", counterparty_name: "", counterparty_country: "", location: loc, memo: "", triggered: "Y" }));
  for (let i = 0; i < 8; i++) rows.push({ ...s, txn_id: `TX-A${10 + i}`, txn_timestamp: iso(5 + i * 9, 9), amount: String(1400 + i * 35), direction: "in", channel: "ach", counterparty_name: "Square settlement", counterparty_country: "US", location: "", memo: "", triggered: "N" });

  const p = {
    alert_id: "TM-100232",
    rule_code: "ACH-VOL-02",
    rule_description: "Outbound ACH count above three times the 90-day baseline",
    typology: "payroll_pattern",
    alert_created_at: iso(0, 9),
    customer_id: "CUST-55219",
    customer_name: "Sample Business B LLC",
    customer_type: "business",
    occupation: "Dental practice",
    country: "US",
    onboarded_at: iso(900),
    risk_rating: "low",
    expected_monthly_volume: "48000",
    kyc_notes: "",
  };
  const staff = ["Employee 1", "Employee 2", "Employee 3", "Employee 4"];
  for (let d = 70; d > 0; d -= 14) staff.forEach((e, i) => rows.push({ ...p, txn_id: `TX-B${d}-${i}`, txn_timestamp: iso(d, 6), amount: String(2100 + i * 400), direction: "out", channel: "ach", counterparty_name: e, counterparty_country: "US", location: "", memo: "PAYROLL", triggered: d <= 14 ? "Y" : "N" }));

  const csv = Papa.unparse({ fields: [...CSV_COLUMNS], data: rows.map((r) => CSV_COLUMNS.map((c) => r[c] ?? "")) });
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="assay-alert-import-template.csv"' } });
}
