import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { alerts, customers, priorCases, transactions, workspaces, type Typology } from "./db/schema";
import { triageAlert } from "./engine/run";
import { canRun } from "./metering";
import { DAY, newId } from "./util";

type Workspace = typeof workspaces.$inferSelect;

import { AlertPayload, CSV_COLUMNS, inferTypology } from "./import-schema";
export { AlertPayload, CSV_COLUMNS, inferTypology };


/** Writes one alert with its customer and evidence. Returns the new alert id, or null if it already exists. */
export async function ingestAlert(db: DB, ws: Workspace, p: AlertPayload, source: "csv" | "api"): Promise<string | null> {
  const [dup] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.workspaceId, ws.id), eq(alerts.externalId, p.alert.external_id)));
  if (dup) return null;

  let [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.workspaceId, ws.id), eq(customers.externalId, p.customer.external_id)));
  if (!cust) {
    [cust] = await db
      .insert(customers)
      .values({
        id: newId("KYC"),
        workspaceId: ws.id,
        externalId: p.customer.external_id,
        name: p.customer.name,
        kind: p.customer.type,
        occupation: p.customer.occupation ?? null,
        country: p.customer.country ?? "US",
        onboardedAt: p.customer.onboarded_at ? new Date(p.customer.onboarded_at) : null,
        riskRating: p.customer.risk_rating ?? "medium",
        expectedMonthlyVolumeCents: p.customer.expected_monthly_volume != null ? Math.round(p.customer.expected_monthly_volume * 100) : null,
        kycNotes: p.customer.kyc_notes ?? null,
      })
      .returning();
  }

  const extIds = p.transactions.map((t) => t.external_id);
  const existing = extIds.length
    ? await db
        .select({ id: transactions.id, externalId: transactions.externalId })
        .from(transactions)
        .where(and(eq(transactions.workspaceId, ws.id), inArray(transactions.externalId, extIds)))
    : [];
  const idByExt = new Map(existing.map((e) => [e.externalId!, e.id]));
  const fresh = p.transactions
    .filter((t) => !idByExt.has(t.external_id))
    .map((t) => {
      const id = newId("TXN", 8);
      idByExt.set(t.external_id, id);
      return {
        id,
        workspaceId: ws.id,
        customerId: cust.id,
        externalId: t.external_id,
        ts: new Date(t.timestamp),
        amountCents: Math.round(t.amount * 100),
        currency: t.currency ?? "USD",
        direction: t.direction,
        channel: t.channel,
        counterpartyName: t.counterparty_name ?? null,
        counterpartyCountry: t.counterparty_country ?? null,
        branch: t.location ?? null,
        memo: t.memo ?? null,
      };
    });
  for (let i = 0; i < fresh.length; i += 500) await db.insert(transactions).values(fresh.slice(i, i + 500));

  if (p.prior_cases?.length) {
    await db.insert(priorCases).values(
      p.prior_cases.map((c) => ({ id: newId("CASE"), workspaceId: ws.id, customerId: cust.id, kind: c.kind, openedAt: new Date(c.opened_at), outcome: c.outcome, summary: c.summary })),
    );
  }

  const createdAt = p.alert.created_at ? new Date(p.alert.created_at) : new Date();
  const alertId = newId("ALT");
  await db.insert(alerts).values({
    id: alertId,
    workspaceId: ws.id,
    externalId: p.alert.external_id,
    customerId: cust.id,
    ruleCode: p.alert.rule_code,
    ruleDescription: p.alert.rule_description ?? p.alert.rule_code,
    typology: p.alert.typology ?? inferTypology(p.alert.rule_code, p.alert.rule_description),
    source,
    status: "new",
    triggeredTxnIds: (p.alert.triggered_transaction_ids ?? []).map((e) => idByExt.get(e)).filter((x): x is string => !!x),
    createdAt,
    slaDueAt: new Date(createdAt.getTime() + ws.settings.internalSlaDays * DAY),
  });
  return alertId;
}

const num = (v: string | undefined) => (v == null || v.trim() === "" ? undefined : Number(v.replace(/[$,]/g, "")));
const opt = (v: string | undefined) => (v == null || v.trim() === "" ? undefined : v.trim());



/** Parses the one-row-per-transaction CSV, groups rows by alert, ingests and triages. */
export async function importAlertsCsv(db: DB, ws: Workspace, csv: string, actor: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const errors: string[] = [];
  if (parsed.errors.length) errors.push(...parsed.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}.`));
  const missing = ["alert_id", "rule_code", "customer_id", "customer_name", "txn_id", "txn_timestamp", "amount", "direction", "channel"].filter(
    (c) => !parsed.meta.fields?.map((f) => f.toLowerCase()).includes(c),
  );
  if (missing.length) return { alerts: 0, transactions: 0, triaged: 0, errors: [`Missing required columns: ${missing.join(", ")}. Download the template for the expected layout.`] };

  const groups = new Map<string, Record<string, string>[]>();
  parsed.data.forEach((r) => {
    const k = opt(r.alert_id);
    if (!k) return;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  if (groups.size > 200) return { alerts: 0, transactions: 0, triaged: 0, errors: ["Import up to 200 alerts per file. Use the API for larger volumes."] };

  let created = 0;
  let txCount = 0;
  const newIds: string[] = [];
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
    const id = await ingestAlert(db, ws, result.data, "csv");
    if (!id) {
      errors.push(`Alert ${alertExt} was already imported.`);
      continue;
    }
    created++;
    txCount += result.data.transactions.length;
    newIds.push(id);
  }

  if (created) {
    await appendAudit(db, { workspaceId: ws.id, actorType: "human", actorName: actor, action: "alerts.imported", entityType: "workspace", entityId: ws.id, payload: { source: "csv", alerts: created, transactions: txCount } });
  }

  let triaged = 0;
  for (const id of newIds) {
    const allowed = await canRun(db, ws);
    if (!allowed.ok) {
      errors.push(allowed.reason);
      break;
    }
    await triageAlert(db, ws, id, { initiatedBy: actor });
    triaged++;
  }
  return { alerts: created, transactions: txCount, triaged, errors };
}
