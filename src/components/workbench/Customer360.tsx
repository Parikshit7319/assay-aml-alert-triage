"use client";

import { useId, useMemo, useState } from "react";
import { CounterpartyGraph } from "@/components/viz/CounterpartyGraph";
import { formatUsd, type VizTxnWithCountry } from "@/components/viz/helpers";
import { TransactionTimeline } from "@/components/viz/TransactionTimeline";
import { REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { inflowVsExpected, monthlyFlows } from "./customer-inflow";
import { Time } from "./Time";
import "./workbench.css";

export interface Customer360Props {
  customer: {
    id: string;
    name: string;
    kind: string;
    occupation: string | null;
    country: string;
    onboardedAt: string | Date | null;
    riskRating: string;
    expectedMonthlyVolumeCents: number | null;
    kycNotes: string | null;
  };
  alerts: { id: string; typology: string; status: string; recommendation: string | null; riskScore: number | null; createdAt: string | Date }[];
  /** Transactions in the viz shape (ts as an ISO string, amounts in cents). */
  transactions: VizTxnWithCountry[];
  priorCases: { id: string; kind: string; openedAt: string | Date; outcome: string; summary: string }[];
  highRiskCountries: string[];
  onOpenAlert: (id: string) => void;
  /** End of the 90-day window. Defaults to the newest alert's creation time, else now. */
  asOf?: string | Date;
  /** Transactions that triggered the current alert, drawn bold on the timeline. */
  triggeredIds?: string[];
}

/**
 * One customer across every alert: KYC profile, expected against actual
 * inflow, the 90-day transaction timeline, the counterparty graph, alerts
 * and prior cases. Picking a counterparty highlights its transactions on the
 * timeline.
 */
export function Customer360({ customer, alerts, transactions, priorCases, highRiskCountries, onOpenAlert, asOf, triggeredIds = [] }: Customer360Props) {
  const ids = useId();
  const [lit, setLit] = useState<string[]>([]);
  const end = useMemo(() => {
    if (asOf) return new Date(asOf);
    const newest = alerts.reduce<number>((m, a) => Math.max(m, new Date(a.createdAt).getTime()), 0);
    return newest ? new Date(newest) : new Date();
  }, [asOf, alerts]);
  const endIso = end.toISOString();
  const inflow = useMemo(() => inflowVsExpected(transactions, customer.expectedMonthlyVolumeCents, end), [transactions, customer.expectedMonthlyVolumeCents, end]);
  const months = useMemo(() => monthlyFlows(transactions, end, 3), [transactions, end]);
  const maxBar = Math.max(1, customer.expectedMonthlyVolumeCents ?? 0, ...months.map((m) => m.inCents));
  const sortedAlerts = useMemo(() => [...alerts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [alerts]);
  const over = inflow.ratio != null && inflow.ratio >= 1.5;

  return (
    <div className="wb-c360">
      <section className="panel wb-c360__profile" aria-labelledby={`${ids}-name`}>
        <div className="panel__head">
          <h2 id={`${ids}-name`}>{customer.name}</h2>
          <span className="num">{customer.id}</span>
        </div>
        <div className="panel__body wb-c360__profile-body">
          <dl className="kv">
            <dt>Type</dt>
            <dd>{customer.kind}</dd>
            <dt>Occupation</dt>
            <dd>{customer.occupation ?? "Not recorded"}</dd>
            <dt>Country</dt>
            <dd>{customer.country}</dd>
            <dt>Customer since</dt>
            <dd>{customer.onboardedAt ? <Time value={customer.onboardedAt} format="date" /> : "Not recorded"}</dd>
            <dt>Risk rating</dt>
            <dd>{customer.riskRating}</dd>
            <dt>Alerts</dt>
            <dd className="num">
              {alerts.length}, prior cases {priorCases.length}
            </dd>
          </dl>
          <div className="wb-inflow" role="group" aria-labelledby={`${ids}-inflow`}>
            <h3 id={`${ids}-inflow`}>Expected and actual inflow</h3>
            <p className={over ? "wb-inflow__line wb-red" : "wb-inflow__line"}>{inflow.sentence}</p>
            <ul className="wb-inflow__bars">
              {months.map((m) => (
                <li key={m.key}>
                  <span className="wb-inflow__label">{m.label}</span>
                  <span className="wb-inflow__track" aria-hidden="true">
                    <i style={{ width: `${(m.inCents / maxBar) * 100}%` }} />
                    {customer.expectedMonthlyVolumeCents ? <b style={{ left: `${(customer.expectedMonthlyVolumeCents / maxBar) * 100}%` }} /> : null}
                  </span>
                  <span className="wb-inflow__val num">{formatUsd(Math.round(m.inCents / 100) * 100)} in</span>
                </li>
              ))}
            </ul>
            {customer.expectedMonthlyVolumeCents ? (
              <p className="wb-foot-note wb-foot-note--flush">
                <span className="wb-inflow__key" aria-hidden="true" /> Marker: {formatUsd(customer.expectedMonthlyVolumeCents)} a month expected at onboarding. Months are calendar months in UTC; the newest may be partial.
              </p>
            ) : null}
          </div>
        </div>
        {customer.kycNotes && <p className="note wb-c360__kyc">{customer.kycNotes}</p>}
      </section>

      <section className="panel" aria-labelledby={`${ids}-tl`}>
        <div className="panel__head">
          <h2 id={`${ids}-tl`}>Last 90 days</h2>
          <span>{lit.length ? `${lit.length} highlighted` : "pick a counterparty below to highlight its transactions"}</span>
        </div>
        <div className="panel__body">
          <TransactionTimeline transactions={transactions} triggeredIds={triggeredIds} highlightedIds={lit} alertCreatedAt={endIso} onSelect={(id) => setLit((cur) => (cur.length === 1 && cur[0] === id ? [] : [id]))} />
        </div>
      </section>

      <section className="panel" aria-labelledby={`${ids}-cp`}>
        <div className="panel__head">
          <h2 id={`${ids}-cp`}>Who pays and who gets paid</h2>
          {lit.length > 0 && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setLit([])}>
              Clear highlight
            </button>
          )}
        </div>
        <div className="panel__body">
          <CounterpartyGraph customerName={customer.name} transactions={transactions} highRiskCountries={highRiskCountries} highlightedIds={lit} onSelect={(txnIds) => setLit((cur) => (cur.join() === txnIds.join() ? [] : txnIds))} />
        </div>
      </section>

      <div className="wb-c360__lists">
        <section className="panel" aria-labelledby={`${ids}-al`}>
          <div className="panel__head">
            <h2 id={`${ids}-al`}>Alerts on this customer</h2>
            <span className="num">{alerts.length}</span>
          </div>
          {sortedAlerts.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Alert</th>
                    <th>Type</th>
                    <th>Agent</th>
                    <th className="r">Risk</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAlerts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <button type="button" className="wb-linkbtn num" onClick={() => onOpenAlert(a.id)}>
                          {a.id}
                        </button>
                      </td>
                      <td>{TYPOLOGY_LABEL[a.typology as keyof typeof TYPOLOGY_LABEL] ?? a.typology}</td>
                      <td>{a.recommendation ? <span className={`rec rec-${a.recommendation}`}>{REC_LABEL[a.recommendation as keyof typeof REC_LABEL] ?? a.recommendation}</span> : <span className="rec rec-hidden">Not triaged</span>}</td>
                      <td className="r num">{a.riskScore ?? ""}</td>
                      <td>{STATUS_LABEL[a.status as keyof typeof STATUS_LABEL] ?? a.status}</td>
                      <td className="num">
                        <Time value={a.createdAt} format="date" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="wb-foot-note">No alerts on this customer.</p>
          )}
        </section>

        <section className="panel" aria-labelledby={`${ids}-pc`}>
          <div className="panel__head">
            <h2 id={`${ids}-pc`}>Prior cases</h2>
            <span className="num">{priorCases.length}</span>
          </div>
          <div className="panel__body">
            {priorCases.length ? (
              <ul className="cases">
                {priorCases.map((c) => (
                  <li key={c.id}>
                    <b className="num">{c.id}</b> {c.kind === "sar" ? "SAR" : "Alert"}, {c.outcome}
                    <span>
                      <Time value={c.openedAt} format="date" />: {c.summary}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="decide__hint">No prior alerts or SARs for this customer.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
