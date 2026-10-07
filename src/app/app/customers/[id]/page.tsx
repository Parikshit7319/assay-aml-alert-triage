import { Time } from "@/components/workbench/Time";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CounterpartyGraph } from "@/components/viz/CounterpartyGraph";
import { TransactionTimeline } from "@/components/viz/TransactionTimeline";
import { alerts, customers, priorCases, transactions, triageRuns } from "@/lib/db/schema";
import { DEFAULT_HIGH_RISK_COUNTRIES } from "@/lib/engine/policy";
import { REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";
import { DAY, usd } from "@/lib/util";

const KIND = { individual: "Individual", business: "Business" } as const;
const RISK = { low: "Low", medium: "Medium", high: "High" } as const;
const CHANNEL = { cash: "Cash", wire: "Wire", ach: "ACH", p2p: "P2P", card: "Card", check: "Check" } as const;
const OPEN = new Set(["new", "triaged", "locked"]);

/** End of the 90-day window: the latest transaction or alert we hold, else now. */
function windowEnd(...dates: (Date | undefined)[]): Date {
  const latest = Math.max(0, ...dates.map((d) => d?.getTime() ?? 0));
  return latest ? new Date(latest) : new Date();
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await requireTenant();
  const [customer] = await t.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.workspaceId, t.ws.id)));
  if (!customer) notFound();

  const [alertRows, cases, [latestTxn]] = await Promise.all([
    t.db
      .select({ alert: alerts, run: triageRuns })
      .from(alerts)
      .leftJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
      .where(and(eq(alerts.workspaceId, t.ws.id), eq(alerts.customerId, customer.id)))
      .orderBy(desc(alerts.createdAt)),
    t.db
      .select()
      .from(priorCases)
      .where(and(eq(priorCases.workspaceId, t.ws.id), eq(priorCases.customerId, customer.id)))
      .orderBy(desc(priorCases.openedAt)),
    t.db
      .select({ ts: transactions.ts })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, t.ws.id), eq(transactions.customerId, customer.id)))
      .orderBy(desc(transactions.ts))
      .limit(1),
  ]);

  // The 90-day window ends at the latest activity we hold (or now), so imported history still shows.
  const latestAlertAt = alertRows[0]?.alert.createdAt;
  const anchor = windowEnd(latestTxn?.ts, latestAlertAt);
  const windowStart = new Date(anchor.getTime() - 90 * DAY);
  const txns = await t.db
    .select()
    .from(transactions)
    .where(and(eq(transactions.workspaceId, t.ws.id), eq(transactions.customerId, customer.id), gte(transactions.ts, windowStart), lte(transactions.ts, anchor)))
    .orderBy(asc(transactions.ts));

  const inflow = txns.filter((x) => x.direction === "in").reduce((s, x) => s + x.amountCents, 0);
  const outflow = txns.filter((x) => x.direction === "out").reduce((s, x) => s + x.amountCents, 0);
  const monthlyIn = Math.round(inflow / 3);
  const expected = customer.expectedMonthlyVolumeCents;
  const ratio = expected && expected > 0 ? monthlyIn / expected : null;
  const openCount = alertRows.filter((r) => OPEN.has(r.alert.status)).length;
  const triggered = [...new Set(alertRows.flatMap((r) => r.alert.triggeredTxnIds))];
  const shadowTypes = new Set(Object.entries(t.ws.settings.autonomy).filter(([, l]) => l === 0).map(([k]) => k));
  // Records the agent cited on alerts still being worked. Open alerts in shadow mode keep their output hidden.
  const cited = [
    ...new Set(
      alertRows
        .filter((r) => (OPEN.has(r.alert.status) && !shadowTypes.has(r.alert.typology)) || r.alert.status === "escalated")
        .flatMap((r) => (r.run?.rationale ?? []).flatMap((c) => c.citations)),
    ),
  ];
  const vizTxns = txns.map((x) => ({
    id: x.id,
    ts: x.ts.toISOString(),
    amountCents: x.amountCents,
    direction: x.direction,
    channel: x.channel,
    counterpartyName: x.counterpartyName,
    counterpartyCountry: x.counterpartyCountry,
    branch: x.branch,
  }));

  return (
    <>
      <p style={{ marginBottom: 10, fontSize: 13.5 }}>
        <Link href="/app/customers">Customers</Link>
      </p>
      <div className="app-head">
        <div>
          <h1>{customer.name}</h1>
          <p>
            <span className="num">{customer.id}</span>
            {customer.externalId ? `, core record ${customer.externalId}` : ""}, {KIND[customer.kind].toLowerCase()}
            {customer.occupation ? `, ${customer.occupation}` : ""}, {customer.country}
          </p>
        </div>
      </div>

      <section className="panel summary" aria-label="Customer summary">
        <div className="summary__item">
          <b className={customer.riskRating === "high" ? "sla-late" : undefined}>{RISK[customer.riskRating]}</b>
          <span>KYC risk rating</span>
        </div>
        <div className="summary__item">
          <b className="num">{expected != null ? usd(expected) : "Not set"}</b>
          <span>Expected monthly volume</span>
        </div>
        <div className="summary__item">
          <b className="num">{usd(monthlyIn)}</b>
          <span>
            Actual monthly inflow, 90-day average
            {ratio != null ? `, ${ratio >= 1 ? `${ratio.toFixed(1)} times` : `${Math.round(ratio * 100)}% of`} expected` : ""}
          </span>
        </div>
        <div className="summary__item">
          <b className="num">{openCount}</b>
          <span>Open alerts of {alertRows.length}</span>
        </div>
        <div className="summary__item">
          <b className="num">{cases.length}</b>
          <span>Prior cases</span>
        </div>
      </section>

      <div className="settings-grid">
        <section className="panel table-wrap" aria-labelledby="calerts-h">
          <div className="panel__head">
            <h2 id="calerts-h">Alerts</h2>
            <span>{alertRows.length}</span>
          </div>
          {alertRows.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Alert</th>
                  <th scope="col">Status</th>
                  <th scope="col">Latest recommendation</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {alertRows.map(({ alert, run }) => {
                  const hidden = OPEN.has(alert.status) && shadowTypes.has(alert.typology);
                  return (
                    <tr key={alert.id}>
                      <td>
                        <Link className="row-link num" href={`/app/alerts/${encodeURIComponent(alert.id)}`}>
                          {alert.id}
                        </Link>
                        <span className="cell-sub">
                          {TYPOLOGY_LABEL[alert.typology]}, {alert.ruleCode}
                        </span>
                      </td>
                      <td>{STATUS_LABEL[alert.status]}</td>
                      <td>
                        {!run ? (
                          <span className="cell-sub">Not triaged</span>
                        ) : hidden ? (
                          <span className="rec rec-hidden">Hidden in shadow mode</span>
                        ) : (
                          <span className={`rec rec-${run.recommendation}`}>
                            {REC_LABEL[run.recommendation]} {Math.round(run.confidence * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="num"><Time value={alert.createdAt} format="date" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <p>No alerts for this customer.</p>
            </div>
          )}
        </section>

        <div className="facts">
          <section className="panel" aria-labelledby="kyc-h">
            <div className="panel__head">
              <h2 id="kyc-h">KYC profile</h2>
              <span className="num">{customer.id}</span>
            </div>
            <div className="panel__body">
              <dl className="kv">
                <dt>Type</dt>
                <dd>{KIND[customer.kind]}</dd>
                <dt>{customer.kind === "business" ? "Industry" : "Occupation"}</dt>
                <dd>{customer.occupation ?? "Not recorded"}</dd>
                <dt>Country</dt>
                <dd>{customer.country}</dd>
                <dt>Customer since</dt>
                <dd>{customer.onboardedAt ? <Time value={customer.onboardedAt} format="date" /> : "Not recorded"}</dd>
                <dt>Risk rating</dt>
                <dd>{RISK[customer.riskRating]}</dd>
                <dt>Expected monthly</dt>
                <dd className="num">{expected != null ? usd(expected) : "Not set"}</dd>
                <dt>In, last 90 days</dt>
                <dd className="num">{usd(inflow)}</dd>
                <dt>Out, last 90 days</dt>
                <dd className="num">{usd(outflow)}</dd>
              </dl>
              {customer.kycNotes && <p className="note">{customer.kycNotes}</p>}
            </div>
          </section>
          <section className="panel" aria-labelledby="cases-h">
            <div className="panel__head">
              <h2 id="cases-h">Prior cases</h2>
              <span>{cases.length}</span>
            </div>
            <div className="panel__body">
              {cases.length ? (
                <ul className="cases">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <b className="num">{c.id}</b> {c.kind === "sar" ? "SAR" : "Alert"}, <Time value={c.openedAt} format="date" />, {c.outcome}
                      <span>{c.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="decide__hint" style={{ margin: 0 }}>
                  No earlier alerts or SARs on record.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 16 }} aria-labelledby="tl-h">
        <div className="panel__head">
          <h2 id="tl-h">Activity, last 90 days</h2>
          <span>
            {txns.length} transactions to <Time value={anchor} format="date" />
          </span>
        </div>
        <div className="panel__body">
          {txns.length ? (
            <TransactionTimeline transactions={vizTxns} triggeredIds={triggered} highlightedIds={cited} alertCreatedAt={anchor.toISOString()} showTable={false} />
          ) : (
            <p className="decide__hint" style={{ margin: 0 }}>
              No transactions in this window.
            </p>
          )}
        </div>
      </section>

      {txns.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }} aria-labelledby="cp-h">
          <div className="panel__head">
            <h2 id="cp-h">Counterparties</h2>
            <span>senders left, receivers right</span>
          </div>
          <div className="panel__body">
            <CounterpartyGraph customerName={customer.name} transactions={vizTxns} highRiskCountries={DEFAULT_HIGH_RISK_COUNTRIES} highlightedIds={cited} showTable={false} />
          </div>
        </section>
      )}

      <section className="panel table-wrap" style={{ marginTop: 16 }} aria-labelledby="tx-h">
        <div className="panel__head">
          <h2 id="tx-h">Transactions, last 90 days</h2>
          <span>newest first; triggering transactions marked</span>
        </div>
        {txns.length ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Time</th>
                <th scope="col">Direction</th>
                <th scope="col">Channel</th>
                <th scope="col" className="r">
                  Amount
                </th>
                <th scope="col">Counterparty</th>
                <th scope="col">Branch</th>
                <th scope="col">Memo</th>
              </tr>
            </thead>
            <tbody>
              {[...txns].reverse().map((x) => {
                const trig = triggered.includes(x.id);
                return (
                  <tr key={x.id} className={cited.includes(x.id) ? "is-cited" : undefined}>
                    <td className="num">
                      {x.id}
                      {trig && <span className="cell-sub">Triggered an alert</span>}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      <Time value={x.ts} />
                    </td>
                    <td>{x.direction === "in" ? "In" : "Out"}</td>
                    <td>{CHANNEL[x.channel]}</td>
                    <td className="r num">{usd(x.amountCents, { cents: true })}</td>
                    <td>
                      {x.counterpartyName ?? <span className="cell-sub">None</span>}
                      {x.counterpartyCountry && <span className="cell-sub">{x.counterpartyCountry}</span>}
                    </td>
                    <td>{x.branch ?? ""}</td>
                    <td>{x.memo ? <span className="memo" title={x.memo}>{x.memo}</span> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <p>No transactions in the last 90 days of activity.</p>
          </div>
        )}
      </section>
    </>
  );
}
