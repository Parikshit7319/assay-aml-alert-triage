/**
 * Turns an imported CSV into demo scenarios in the browser, using the same
 * parsing and validation rules as the product importer. Nothing is stored.
 */
import type { CaseRecord, CustomerRecord, TxnRecord } from "@/lib/engine/types";
import { inferTypology, parseAlertCsv, type AlertPayload } from "@/lib/import-schema";
import { newId } from "@/lib/util";
import type { Scenario } from "./scenarios";

/** Converts one validated import payload into the demo Scenario shape with fresh internal ids. */
export function payloadToScenario(p: AlertPayload, now: Date = new Date()): Scenario {
  const c = p.customer;
  const customer: CustomerRecord = {
    id: newId("KYC"),
    name: c.name,
    kind: c.type,
    occupation: c.occupation ?? null,
    country: c.country ?? "US",
    onboardedAt: c.onboarded_at ? new Date(c.onboarded_at) : null,
    riskRating: c.risk_rating ?? "medium",
    expectedMonthlyVolumeCents: c.expected_monthly_volume != null ? Math.round(c.expected_monthly_volume * 100) : null,
    kycNotes: c.kyc_notes ?? null,
  };

  const idByExt = new Map<string, string>();
  const transactions: TxnRecord[] = p.transactions.map((t) => {
    const id = newId("TXN", 8);
    idByExt.set(t.external_id, id);
    return {
      id,
      ts: new Date(t.timestamp),
      amountCents: Math.round(t.amount * 100),
      direction: t.direction,
      channel: t.channel,
      counterpartyName: t.counterparty_name ?? null,
      counterpartyCountry: t.counterparty_country ?? null,
      branch: t.location ?? null,
      memo: t.memo ?? null,
    };
  });

  const priorCases: CaseRecord[] = (p.prior_cases ?? []).map((pc) => ({
    id: newId("CASE"),
    kind: pc.kind,
    openedAt: new Date(pc.opened_at),
    outcome: pc.outcome,
    summary: pc.summary,
  }));

  const a = p.alert;
  return {
    key: `csv_${a.external_id}`,
    customer,
    transactions,
    priorCases,
    alert: {
      ruleCode: a.rule_code,
      ruleDescription: a.rule_description ?? a.rule_code,
      typology: a.typology ?? inferTypology(a.rule_code, a.rule_description),
      createdAt: a.created_at ? new Date(a.created_at) : now,
      triggeredTxnIds: (a.triggered_transaction_ids ?? []).map((e) => idByExt.get(e)).filter((x): x is string => !!x),
    },
  };
}

/** Parses an alert CSV (template layout) into demo scenarios. Invalid alerts are listed in `errors`. */
export function csvToScenarios(text: string, now: Date = new Date()): { scenarios: Scenario[]; errors: string[] } {
  const { payloads, errors } = parseAlertCsv(text);
  return { scenarios: payloads.map((p) => payloadToScenario(p, now)), errors };
}
