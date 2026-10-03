"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ActionState } from "@/lib/action-types";
import type { PolicyHit, RationaleItem, TraceStep, Typology, ValidationResult } from "@/lib/db/schema";
import type { WatchlistHit } from "@/lib/engine/types";
import { ACTION_LABEL, daysLeft, fmtDate, fmtDateTime, REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";

interface Txn {
  id: string;
  ts: string;
  amountCents: number;
  direction: "in" | "out";
  channel: string;
  counterpartyName: string | null;
  counterpartyCountry: string | null;
  branch: string | null;
  memo: string | null;
}

type Act = (prev: ActionState, fd: FormData) => Promise<ActionState>;

interface Props {
  actions: { decide: Act; markSuspicious: Act; sarDecision: Act; rerun: Act };
  alert: {
    id: string;
    externalId: string | null;
    ruleCode: string;
    ruleDescription: string;
    typology: Typology;
    status: keyof typeof STATUS_LABEL;
    createdAt: string;
    slaDueAt: string;
    suspicionDeterminedAt: string | null;
    sarDueAt: string | null;
    triggeredTxnIds: string[];
    source: string;
  };
  customer: {
    id: string;
    name: string;
    kind: string;
    occupation: string | null;
    country: string;
    onboardedAt: string | null;
    riskRating: string;
    expectedMonthlyVolumeCents: number | null;
    kycNotes: string | null;
  };
  transactions: Txn[];
  historyCited: Txn[];
  historyCount: number;
  priorCases: { id: string; kind: string; openedAt: string; outcome: string; summary: string }[];
  watchlistHits: WatchlistHit[];
  injectionTxnIds: string[];
  run: null | {
    id: string;
    startedAt: string;
    finishedAt: string;
    agentIdentity: string;
    provider: string;
    model: string;
    policyVersion: number;
    outcome: string;
    modelRecommendation: string | null;
    recommendation: "close" | "escalate" | "human_review";
    confidence: number;
    riskScore: number;
    rationale: RationaleItem[];
    trace: TraceStep[];
    policyHits: PolicyHit[];
    validation: ValidationResult;
    narrative: string | null;
    batchEligible: boolean;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    costEstimated: boolean;
  };
  runHistory: { id: string; at: string; model: string; policyVersion: number; recommendation: string }[];
  decisions: { id: string; actorType: string; actorName: string; action: string; reasonCode: string | null; note: string | null; createdAt: string }[];
  shadow: boolean;
  reasons: { code: string; label: string }[];
  demo: boolean;
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const CHANNEL: Record<string, string> = { cash: "Cash", ach: "ACH", card: "Card", wire: "Wire", p2p: "P2P", check: "Check" };

function useSeconds() {
  const start = useRef<number>(0);
  const [, force] = useState(0);
  useEffect(() => {
    start.current = Date.now();
    const t = setInterval(() => force((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  return () => (start.current ? Math.round((Date.now() - start.current) / 1000) : 0);
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="form-error">{state.error}</p>;
  if (state.ok) return <p className="form-ok">{state.ok}</p>;
  return null;
}

export function AlertWorkspace(p: Props) {
  const { alert, customer, run } = p;
  const [active, setActive] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(!p.shadow);
  const [replay, setReplay] = useState(0);
  const [showAll, setShowAll] = useState(true);
  const seconds = useSeconds();
  const [decState, decide, deciding] = useActionState<ActionState, FormData>(p.actions.decide, {});
  const [susState, suspicious, marking] = useActionState<ActionState, FormData>(p.actions.markSuspicious, {});
  const [sarState, sar, recording] = useActionState<ActionState, FormData>(p.actions.sarDecision, {});
  const [rerunState, rerun, rerunning] = useActionState<ActionState, FormData>(p.actions.rerun, {});
  const secRef = useRef<HTMLInputElement>(null);

  const activeSet = useMemo(() => new Set(active), [active]);
  const triggered = useMemo(() => new Set(alert.triggeredTxnIds), [alert.triggeredTxnIds]);
  const injected = useMemo(() => new Set(p.injectionTxnIds), [p.injectionTxnIds]);
  const allTxns = useMemo(() => [...p.transactions, ...p.historyCited], [p.transactions, p.historyCited]);
  const visibleTxns = showAll ? allTxns : allTxns.filter((t) => activeSet.has(t.id) || triggered.has(t.id));

  const cite = (ids: string[]) => {
    setActive((cur) => (cur.join() === ids.join() ? [] : ids));
    const first = ids.find((id) => document.getElementById(`rec-${id}`));
    if (first) document.getElementById(`rec-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const stamp = (id: string) => (
    <button
      key={id}
      type="button"
      className={`stamp ${id.startsWith("WL-") ? "stamp-red" : ""}`}
      aria-pressed={activeSet.has(id)}
      onClick={() => cite([id])}
      title={`Show record ${id}`}
    >
      <span>{id}</span>
    </button>
  );
  const stampGroup = (ids: string[]) =>
    ids.length > 4 ? (
      <>
        {ids.slice(0, 2).map(stamp)}
        <button type="button" className="stamp stamp-muted" aria-pressed={active.join() === ids.join()} onClick={() => cite(ids)} title="Highlight all cited records">
          <span>all {ids.length} records</span>
        </button>
      </>
    ) : (
      ids.map(stamp)
    );

  const open = ["new", "triaged", "locked"].includes(alert.status);
  const rec = run?.recommendation;
  const markClass = rec === "escalate" ? "mark-escalate" : rec === "close" ? "mark-close" : "mark-review";
  const markText =
    run?.outcome === "locked" ? "Locked to human review" : run?.outcome === "abstained" ? "Agent abstained" : rec === "escalate" ? "Escalate to L2" : rec === "close" ? "Close" : "Needs analyst judgment";
  const slaLeft = daysLeft(new Date(alert.slaDueAt));
  const sarLeft = alert.sarDueAt ? daysLeft(new Date(alert.sarDueAt)) : null;
  const setSeconds = () => {
    if (secRef.current) secRef.current.value = String(seconds());
  };

  return (
    <>
      <div className="ws-head">
        <div>
          <h1 className="num">
            {alert.id} <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>{TYPOLOGY_LABEL[alert.typology]}</span>
          </h1>
          <div className="ws-head__meta">
            <span>
              Rule {alert.ruleCode}: {alert.ruleDescription}
            </span>
            <span>Created {fmtDateTime(alert.createdAt)}</span>
            {alert.externalId && <span>Source ID {alert.externalId}</span>}
            <span>{STATUS_LABEL[alert.status]}</span>
          </div>
        </div>
        <div className="clocks">
          {open && (
            <div className="clock">
              <b className={slaLeft <= 3 ? "sla-late" : undefined}>{slaLeft >= 0 ? `${slaLeft} days` : `${-slaLeft} days late`}</b>
              <span>Internal review SLA (your policy)</span>
            </div>
          )}
          {alert.sarDueAt ? (
            <div className="clock clock--sar">
              <b>{sarLeft! >= 0 ? `${sarLeft} days` : `${-sarLeft!} days late`}</b>
              <span>SAR filing deadline, {fmtDate(alert.sarDueAt)}</span>
            </div>
          ) : alert.status === "escalated" ? (
            <div className="clock">
              <b>Not started</b>
              <span>SAR clock starts at L2 determination</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ws-grid">
        {/* -------- Facts -------- */}
        <div className="facts">
          <section className="panel" id={`rec-${customer.id}`} style={activeSet.has(customer.id) ? { boxShadow: "0 0 0 3px var(--highlight-solid)" } : undefined}>
            <div className="panel__head">
              <h2>Customer</h2>
              {stamp(customer.id)}
            </div>
            <div className="panel__body">
              <p style={{ fontWeight: 650, marginBottom: 8 }}>{customer.name}</p>
              <dl className="kv">
                <dt>Type</dt>
                <dd>{customer.kind}</dd>
                <dt>Occupation</dt>
                <dd>{customer.occupation ?? "Not recorded"}</dd>
                <dt>Customer since</dt>
                <dd>{customer.onboardedAt ? fmtDate(customer.onboardedAt) : "Not recorded"}</dd>
                <dt>Risk rating</dt>
                <dd>{customer.riskRating}</dd>
                <dt>Expected volume</dt>
                <dd className="num">{customer.expectedMonthlyVolumeCents != null ? `${money(customer.expectedMonthlyVolumeCents)} a month` : "Not recorded"}</dd>
                <dt>Country</dt>
                <dd>{customer.country}</dd>
              </dl>
              {customer.kycNotes && <p className="note">{customer.kycNotes}</p>}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Prior cases</h2>
              <span>{p.priorCases.length}</span>
            </div>
            <div className="panel__body">
              {p.priorCases.length ? (
                <ul className="cases">
                  {p.priorCases.map((c) => (
                    <li key={c.id} id={`rec-${c.id}`} style={activeSet.has(c.id) ? { background: "var(--highlight)" } : undefined}>
                      {stamp(c.id)} {c.kind === "sar" ? "SAR" : "Alert"}, {c.outcome}
                      <span>
                        {fmtDate(c.openedAt)}: {c.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="decide__hint">No prior alerts or SARs for this customer.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Watchlist candidates</h2>
              <span>at or above 0.80</span>
            </div>
            <div className="panel__body">
              {p.watchlistHits.length ? (
                <ul className="cases">
                  {p.watchlistHits.map((h) => (
                    <li key={h.watchlistId + h.matchedName} id={`rec-${h.watchlistId}`} style={activeSet.has(h.watchlistId) ? { background: "var(--highlight)" } : undefined}>
                      {stamp(h.watchlistId)} &ldquo;{h.watchlistName}&rdquo;
                      <span>
                        vs {h.matchedOn} &ldquo;{h.matchedName}&rdquo;, similarity {h.similarity.toFixed(2)}
                        {h.countryMatch === false ? ", country differs" : h.countryMatch ? ", country matches" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="decide__hint">No names in this case are close to a watchlist entry.</p>
              )}
            </div>
          </section>
        </div>

        {/* -------- Agent -------- */}
        <section className="panel">
          <div className="panel__head">
            <h2>Agent assessment</h2>
            {run && (
              <span>
                {run.model}, policy v{run.policyVersion}
              </span>
            )}
          </div>
          {!run ? (
            <div className="shadow-cover">This alert has not been triaged yet. Run the agent from the queue or with the button on the right.</div>
          ) : !revealed ? (
            <div className="shadow-cover">
              <p style={{ marginBottom: 12 }}>
                This alert type is in shadow mode (autonomy level 0). Decide first, then compare with the agent. Agreement in shadow mode is how an alert type earns more autonomy.
              </p>
              <button type="button" className="btn btn-outline btn-small" onClick={() => setRevealed(true)}>
                Reveal the agent&apos;s view anyway
              </button>
            </div>
          ) : (
            <>
              <div className="verdict">
                <span className={`mark ${markClass}`}>
                  <span>
                    <strong>{markText}</strong>
                    <small>
                      {run.outcome === "completed" ? `${Math.round(run.confidence * 100)}% confidence, risk ${run.riskScore}` : `risk ${run.riskScore}`}
                    </small>
                  </span>
                </span>
                <div className="verdict__facts">
                  {run.modelRecommendation && run.modelRecommendation !== run.recommendation && (
                    <span>
                      Model said <b>{run.modelRecommendation}</b>. Policy changed it to <b>{REC_LABEL[run.recommendation].toLowerCase()}</b>.
                    </span>
                  )}
                  {run.outcome === "completed" && (
                    <span className={run.validation.valid && !run.validation.amountMismatches.length ? "ok" : "warn"}>
                      {run.validation.valid
                        ? `${run.validation.checkedClaims} claims checked, every citation resolves${run.validation.amountMismatches.length ? `, ${run.validation.amountMismatches.length} figure(s) unverified` : ", every dollar figure traced"}`
                        : `${run.validation.unknownCitations.length} citation(s) to unknown records`}
                    </span>
                  )}
                  {run.batchEligible && <span>Eligible for batch approval</span>}
                </div>
              </div>
              {run.policyHits.length > 0 && (
                <div className="policy-hits">
                  <strong>Policy rules applied</strong>
                  <ul>
                    {run.policyHits.map((h) => (
                      <li key={h.rule}>
                        {h.rule}. {h.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className="claims">
                {run.rationale.map((r, i) => (
                  <li key={i}>
                    {r.claim}
                    <span className="stamps">{stampGroup(r.citations)}</span>
                  </li>
                ))}
              </ol>
              {run.narrative && (
                <details className="disclose" style={{ borderTop: "1px solid var(--rule)" }}>
                  <summary>Draft narrative for the L2 investigator</summary>
                  <div className="narrative">{run.narrative}</div>
                  <div style={{ padding: "0 16px 14px" }}>
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => navigator.clipboard?.writeText(run.narrative ?? "")}>
                      Copy draft
                    </button>
                  </div>
                </details>
              )}
              <details className="disclose" style={{ borderTop: "1px solid var(--rule)" }} open>
                <summary>
                  Investigation trace, {run.trace.length} steps
                  <button type="button" className="btn btn-quiet btn-small" style={{ marginLeft: 12 }} onClick={(e) => (e.preventDefault(), setReplay((x) => x + 1))}>
                    Replay
                  </button>
                </summary>
                <ol className={`trace ${replay ? "trace--replay" : ""}`} key={replay}>
                  {run.trace.map((s, i) => (
                    <li key={i} style={{ "--s": i } as React.CSSProperties}>
                      <div>
                        <b>{s.label}</b>
                        <span>{s.summary}</span>
                      </div>
                      <small>{s.ms} ms</small>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </section>

        {/* -------- Decide -------- */}
        <div className="facts">
          {open && (
            <section className="panel">
              <div className="panel__head">
                <h2>Your decision</h2>
                <span>L1</span>
              </div>
              <form className="panel__body decide" action={decide} onSubmit={setSeconds}>
                <input type="hidden" name="alertId" value={alert.id} />
                <input type="hidden" name="seconds" ref={secRef} defaultValue="0" />
                <div className="decide__buttons">
                  <button className="btn btn-close" name="outcome" value="close" type="submit" disabled={deciding}>
                    {rec === "close" && revealed ? "Accept close" : "Close"}
                  </button>
                  <button className="btn btn-danger" name="outcome" value="escalate" type="submit" disabled={deciding}>
                    {rec === "escalate" && revealed ? "Accept escalation" : "Escalate"}
                  </button>
                </div>
                <label className="field">
                  <span>Reason code</span>
                  <select name="reasonCode" defaultValue="">
                    <option value="">None</option>
                    {p.reasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <small>Required when you disagree with the agent.</small>
                </label>
                <label className="field">
                  <span>Note</span>
                  <textarea name="note" rows={3} placeholder="Optional. Goes into the audit log." />
                </label>
                <Feedback state={decState} />
              </form>
            </section>
          )}

          {alert.status === "escalated" && (
            <section className="panel">
              <div className="panel__head">
                <h2>L2 investigation</h2>
                <span>human only</span>
              </div>
              <div className="panel__body decide">
                {!alert.suspicionDeterminedAt ? (
                  <form action={suspicious} className="decide" onSubmit={setSeconds}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <input type="hidden" name="seconds" ref={secRef} defaultValue="0" />
                    <p className="decide__hint">
                      The 30-day SAR clock starts when an investigator determines the activity is suspicious, not when the alert fired. With no suspect identified it extends to 60 days.
                    </p>
                    <label className="check">
                      <input type="checkbox" name="noSuspect" /> No suspect identified yet (60 days)
                    </label>
                    <button className="btn btn-danger" type="submit" disabled={marking}>
                      Mark suspicious and start the clock
                    </button>
                    <Feedback state={susState} />
                  </form>
                ) : null}
                <form action={sar} className="decide" onSubmit={setSeconds}>
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="seconds" defaultValue="0" />
                  <label className="field">
                    <span>Investigator note</span>
                    <textarea name="note" rows={2} />
                  </label>
                  <div className="decide__buttons">
                    <button className="btn" name="decision" value="file" type="submit" disabled={recording || !alert.suspicionDeterminedAt}>
                      Record SAR filed
                    </button>
                    <button className="btn btn-outline" name="decision" value="no_file" type="submit" disabled={recording}>
                      Close, no SAR
                    </button>
                  </div>
                  <Feedback state={sarState} />
                </form>
              </div>
            </section>
          )}

          {run && (
            <section className="panel">
              <div className="panel__head">
                <h2>Run record</h2>
                <span className="num">{run.id}</span>
              </div>
              <div className="panel__body">
                <dl className="run-meta">
                  <dt>Agent identity</dt>
                  <dd>{run.agentIdentity}</dd>
                  <dt>Model</dt>
                  <dd>
                    {run.model} ({run.provider})
                  </dd>
                  <dt>Policy</dt>
                  <dd>v{run.policyVersion}</dd>
                  <dt>Ran at</dt>
                  <dd>{fmtDateTime(run.startedAt)}</dd>
                  <dt>Tokens</dt>
                  <dd>
                    {run.inputTokens.toLocaleString()} in, {run.outputTokens.toLocaleString()} out
                  </dd>
                  <dt>Model cost</dt>
                  <dd>
                    ${(run.costMicros / 1_000_000).toFixed(4)}
                    {run.costEstimated ? " (estimated at Claude Sonnet 5.5 list price)" : ""}
                  </dd>
                </dl>
                {open && (
                  <form action={rerun} style={{ marginTop: 12 }}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <button className="btn btn-outline btn-small" type="submit" disabled={rerunning}>
                      {rerunning ? "Running" : "Run the agent again"}
                    </button>
                    <Feedback state={rerunState} />
                  </form>
                )}
                {p.runHistory.length > 1 && (
                  <details className="disclose" style={{ marginTop: 8 }}>
                    <summary style={{ padding: "8px 0" }}>Earlier runs ({p.runHistory.length - 1})</summary>
                    <ul className="cases">
                      {p.runHistory.slice(1).map((h) => (
                        <li key={h.id}>
                          {h.id}: {REC_LABEL[h.recommendation as keyof typeof REC_LABEL]}
                          <span>
                            {fmtDateTime(h.at)}, {h.model}, policy v{h.policyVersion}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </section>
          )}

          {p.decisions.length > 0 && (
            <section className="panel">
              <div className="panel__head">
                <h2>Decisions</h2>
              </div>
              <div className="panel__body">
                <ul className="cases">
                  {p.decisions.map((d) => (
                    <li key={d.id}>
                      {ACTION_LABEL[d.action] ?? d.action}
                      <span>
                        {d.actorName}, {fmtDateTime(d.createdAt)}
                        {d.reasonCode ? `, reason: ${d.reasonCode.replace(/_/g, " ")}` : ""}
                        {d.note ? `. ${d.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* -------- Evidence -------- */}
      <section className="panel evidence" aria-label="Transactions">
        <div className="panel__head">
          <h2>Transactions</h2>
          <div className="evidence__tools">
            <span>
              {p.transactions.length} in the last 90 days, {p.historyCount} older{p.historyCited.length ? ` (${p.historyCited.length} cited shown)` : ""}
            </span>
            <label className="check">
              <input type="checkbox" checked={!showAll} onChange={(e) => setShowAll(!e.target.checked)} /> Only triggering and highlighted
            </label>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Date</th>
                <th>Type</th>
                <th>Counterparty or location</th>
                <th>Memo</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visibleTxns.map((t) => (
                <tr key={t.id} id={`rec-${t.id}`} className={activeSet.has(t.id) ? "is-cited" : undefined}>
                  <td>
                    <span className="num" style={{ fontWeight: triggered.has(t.id) ? 700 : 500 }}>
                      {t.id}
                    </span>
                    {triggered.has(t.id) && <span className="cell-sub">triggered the rule</span>}
                  </td>
                  <td className="num">{fmtDateTime(t.ts)}</td>
                  <td>
                    {CHANNEL[t.channel] ?? t.channel} {t.direction === "in" ? "in" : "out"}
                  </td>
                  <td>
                    {t.counterpartyName ?? t.branch ?? ""}
                    {t.counterpartyCountry && t.counterpartyCountry !== "US" ? ` (${t.counterpartyCountry})` : ""}
                    {t.counterpartyName && t.branch ? <span className="cell-sub">{t.branch}</span> : null}
                  </td>
                  <td>{t.memo ? <span className={`memo ${injected.has(t.id) ? "memo--flag" : ""}`} title={t.memo}>{injected.has(t.id) ? `Untrusted: ${t.memo}` : t.memo}</span> : null}</td>
                  <td className="r num" style={{ color: t.direction === "out" ? "var(--ink-2)" : undefined }}>
                    {t.direction === "out" ? "-" : ""}
                    {money(t.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {p.demo && <p className="decide__hint" style={{ marginTop: 10 }}>All names, businesses and watchlist entries in this demo are invented.</p>}
    </>
  );
}
