"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AskAgent } from "@/components/demo/AskAgent";
import { ModelKeyDialog } from "@/components/demo/ModelKeyDialog";
import { SarEditor } from "@/components/demo/SarEditor";
import { CounterpartyGraph } from "@/components/viz/CounterpartyGraph";
import type { Channel } from "@/components/viz/helpers";
import { TransactionTimeline } from "@/components/viz/TransactionTimeline";
import { AssigneeSelect } from "@/components/workbench/Assignment";
import { NotesThread, type ThreadNote } from "@/components/workbench/NotesThread";
import { Time } from "@/components/workbench/Time";
import { useToast } from "@/components/workbench/Toasts";
import { useHotkeys } from "@/components/workbench/useHotkeys";
import type { ActionState } from "@/lib/action-types";
import type { AskContext } from "@/lib/ask/offline";
import type { PolicyHit, RationaleItem, TraceStep, Typology, ValidationResult } from "@/lib/db/schema";
import { DEFAULT_HIGH_RISK_COUNTRIES } from "@/lib/engine/policy";
import type { WatchlistHit } from "@/lib/engine/types";
import type { SarDraftInput } from "@/lib/exports/sar";
import { ACTION_LABEL, daysLeft, REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { useModelConfig } from "@/lib/use-model-config";
import { fmtMs } from "@/lib/util";

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

export interface AlertWorkspaceProps {
  actions: { decide: Act; markSuspicious: Act; sarDecision: Act; rerun: Act; assign?: Act; addNote?: Act };
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
    promptVersion?: string | null;
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
  /** Assignment and notes. Omit to hide both. */
  collab?: { members: { id: string; name: string; role?: string }[]; assigneeId: string | null; notes: ThreadNote[]; currentUserId?: string };
  /** Context for "Ask the agent". Omit to hide the panel. */
  ask?: AskContext;
  /** Bank name and contact printed on the SAR draft. */
  institution?: { name: string; contact: string };
  highRiskCountries?: string[];
  customerHref?: string;
  onOpenCustomer?: () => void;
  /** Previous/next alert in the queue, for J/K and auto-advance. */
  nav?: { prevHref?: string | null; nextHref?: string | null; prev?: (() => void) | null; next?: (() => void) | null; position?: string };
  /** Called after the visitor saves their own model key (demo re-runs the alert on it). */
  onModelSaved?: () => void;
  /** Extra controls rendered in the header, for example an export menu. */
  headerExtra?: React.ReactNode;
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const CHANNEL: Record<string, string> = { cash: "Cash", ach: "ACH", card: "Card", wire: "Wire", p2p: "P2P", check: "Check" };
const AUTO_KEY = "assay.autoAdvance";

function useSeconds() {
  const start = useRef<number>(0);
  useEffect(() => {
    start.current = Date.now();
  }, []);
  return () => (start.current ? Math.round((Date.now() - start.current) / 1000) : 0);
}

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}
const autoListeners = new Set<() => void>();
function useAutoAdvance(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    (cb) => (autoListeners.add(cb), () => autoListeners.delete(cb)),
    readAuto,
    () => true,
  );
  const set = (next: boolean) => {
    try {
      window.localStorage.setItem(AUTO_KEY, next ? "1" : "0");
    } catch {
      /* preference only lasts this page view */
    }
    autoListeners.forEach((l) => l());
  };
  return [v, set];
}

/** Toasts each new action result once. Returns nothing; feedback lives in the toast stack. */
function useResultToast(state: ActionState, title: { ok: string; error: string }, onOk?: () => void) {
  const { toast } = useToast();
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.error) toast({ title: title.error, body: state.error, tone: "error" });
    else if (state.ok) {
      toast({ title: title.ok, body: state.ok, tone: "ok" });
      onOk?.();
    }
  }, [state, title.ok, title.error, toast, onOk]);
}

function InlineError({ state }: { state: ActionState }) {
  return state.error ? (
    <p className="form-error" role="alert">
      {state.error}
    </p>
  ) : null;
}

type Tab = "table" | "timeline" | "network";

export function AlertWorkspace(p: AlertWorkspaceProps) {
  const { alert, customer, run } = p;
  const router = useRouter();
  const [active, setActive] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(!p.shadow);
  const [replay, setReplay] = useState(0);
  const [showAll, setShowAll] = useState(true);
  const [tab, setTab] = useState<Tab>("table");
  const [keyOpen, setKeyOpen] = useState(false);
  const [auto, setAuto] = useAutoAdvance();
  const modelConfig = useModelConfig();
  const seconds = useSeconds();
  const [decState, decide, deciding] = useActionState<ActionState, FormData>(p.actions.decide, {});
  const [susState, suspicious, marking] = useActionState<ActionState, FormData>(p.actions.markSuspicious, {});
  const [sarState, sar, recording] = useActionState<ActionState, FormData>(p.actions.sarDecision, {});
  const [rerunState, rerun, rerunning] = useActionState<ActionState, FormData>(p.actions.rerun, {});
  const noop: Act = async () => ({});
  const [assignState, assign, assigning] = useActionState<ActionState, FormData>(p.actions.assign ?? noop, {});
  const [noteState, addNote, noting] = useActionState<ActionState, FormData>(p.actions.addNote ?? noop, {});
  const closeBtn = useRef<HTMLButtonElement>(null);
  const escBtn = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const secRef = useRef<HTMLInputElement>(null);
  const secRef2 = useRef<HTMLInputElement>(null);

  const goNext = p.nav?.next ?? (p.nav?.nextHref ? () => router.push(p.nav!.nextHref!) : null);
  const goPrev = p.nav?.prev ?? (p.nav?.prevHref ? () => router.push(p.nav!.prevHref!) : null);

  useResultToast(decState, { ok: "Decision recorded", error: "Decision not saved" }, () => {
    if (auto && goNext) setTimeout(goNext, 650);
  });
  useResultToast(susState, { ok: "Suspicion determination recorded", error: "Not saved" });
  useResultToast(sarState, { ok: "SAR decision recorded", error: "Not saved" });
  useResultToast(rerunState, { ok: "Agent re-ran", error: "Re-run failed" });
  useResultToast(assignState, { ok: "Assignment saved", error: "Not assigned" });
  useResultToast(noteState, { ok: "Note added", error: "Note not saved" });

  const activeSet = useMemo(() => new Set(active), [active]);
  const activeIds = useMemo(() => [...active], [active]);
  const triggered = useMemo(() => new Set(alert.triggeredTxnIds), [alert.triggeredTxnIds]);
  const injected = useMemo(() => new Set(p.injectionTxnIds), [p.injectionTxnIds]);
  const allTxns = useMemo(() => [...p.transactions, ...p.historyCited], [p.transactions, p.historyCited]);
  const visibleTxns = showAll ? allTxns : allTxns.filter((t) => activeSet.has(t.id) || triggered.has(t.id));
  const vizTxns = useMemo(() => allTxns.map((t) => ({ ...t, channel: t.channel as Channel })), [allTxns]);

  const cite = (ids: string[]) => {
    setActive((cur) => (cur.join() === ids.join() ? [] : ids));
    const first = ids.find((id) => document.getElementById(`rec-${id}`));
    if (first) document.getElementById(`rec-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const citeOnly = (ids: string[]) => {
    setActive(ids);
    if (tab === "table") {
      const first = ids.find((id) => document.getElementById(`rec-${id}`));
      if (first) document.getElementById(`rec-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
  const stamp = (id: string) => (
    <button key={id} type="button" className={`stamp ${id.startsWith("WL-") ? "stamp-red" : ""}`} aria-pressed={activeSet.has(id)} onClick={() => cite([id])} title={`Show record ${id}`}>
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
    const s = String(seconds());
    if (secRef.current) secRef.current.value = s;
    if (secRef2.current) secRef2.current.value = s;
  };
  const showSar = alert.status === "escalated" || alert.status === "sar_filed" || (rec === "escalate" && revealed);

  const sarInput: SarDraftInput | null = useMemo(() => {
    if (!showSar) return null;
    const cited = (run?.rationale ?? []).flatMap((r) => r.citations);
    return {
      alertId: alert.id,
      ruleCode: alert.ruleCode,
      ruleDescription: alert.ruleDescription,
      typology: alert.typology,
      createdAt: alert.createdAt,
      customer: { id: customer.id, name: customer.name, kind: customer.kind === "business" ? "business" : "individual", occupation: customer.occupation, country: customer.country, onboardedAt: customer.onboardedAt },
      transactions: allTxns.map((t) => ({ id: t.id, ts: t.ts, amountCents: t.amountCents, direction: t.direction, channel: t.channel, counterpartyName: t.counterpartyName, counterpartyCountry: t.counterpartyCountry, branch: t.branch })),
      citedIds: [...new Set(cited)],
      rationale: run?.rationale ?? [],
      narrative: run?.narrative ?? "",
      institution: p.institution ?? { name: "Acme Financial (synthetic)", contact: "BSA Officer, Acme Financial" },
    };
  }, [showSar, run, alert, customer, allTxns, p.institution]);

  const submitWith = (dispatch: (fd: FormData) => void, entries: Record<string, string>) => {
    const fd = new FormData();
    Object.entries(entries).forEach(([k, v]) => fd.append(k, v));
    startTransition(() => dispatch(fd));
  };

  useHotkeys({
    c: () => open && closeBtn.current?.click(),
    e: () => open && escBtn.current?.click(),
    o: () => reasonRef.current?.focus(),
    j: () => goNext?.(),
    k: () => goPrev?.(),
    n: (e) => {
      if (notesRef.current) {
        e.preventDefault();
        notesRef.current.focus();
      }
    },
    a: () => {
      if (p.collab?.currentUserId && p.actions.assign) submitWith(assign, { alertId: alert.id, assigneeId: p.collab.currentUserId });
    },
  });

  return (
    <>
      <div className="ws-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="num">
            {alert.id} <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>{TYPOLOGY_LABEL[alert.typology]}</span>
          </h1>
          <div className="ws-head__meta">
            <span>
              Rule {alert.ruleCode}: {alert.ruleDescription}
            </span>
            <span>
              Created <Time value={alert.createdAt} />
            </span>
            {alert.externalId && <span>Source ID {alert.externalId}</span>}
            <span>{STATUS_LABEL[alert.status]}</span>
          </div>
          <div className="ws-tools">
            {(goPrev || goNext) && (
              <span className="ws-nav">
                <button type="button" className="btn btn-quiet btn-small" onClick={() => goPrev?.()} disabled={!goPrev} aria-label="Previous alert (K)">
                  Previous
                </button>
                {p.nav?.position && <span className="num">{p.nav.position}</span>}
                <button type="button" className="btn btn-quiet btn-small" onClick={() => goNext?.()} disabled={!goNext} aria-label="Next alert (J)">
                  Next
                </button>
              </span>
            )}
            {p.collab && p.actions.assign && (
              <AssigneeSelect
                compact
                members={p.collab.members}
                value={p.collab.assigneeId}
                currentUserId={p.collab.currentUserId}
                disabled={assigning}
                onChange={(id) => submitWith(assign, { alertId: alert.id, assigneeId: id ?? "" })}
              />
            )}
            {p.headerExtra}
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
              <span>
                SAR filing deadline, <Time value={alert.sarDueAt} format="date" />
              </span>
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
                <dd>{customer.onboardedAt ? <Time value={customer.onboardedAt} format="date" /> : "Not recorded"}</dd>
                <dt>Risk rating</dt>
                <dd>{customer.riskRating}</dd>
                <dt>Expected volume</dt>
                <dd className="num">{customer.expectedMonthlyVolumeCents != null ? <span className="nowrap">{money(customer.expectedMonthlyVolumeCents)}/mo</span> : "Not recorded"}</dd>
                <dt>Country</dt>
                <dd>{customer.country}</dd>
              </dl>
              {customer.kycNotes && <p className="note">{customer.kycNotes}</p>}
              {(p.customerHref || p.onOpenCustomer) && (
                <p style={{ marginTop: 10, fontSize: 13.5 }}>
                  {p.onOpenCustomer ? (
                    <button type="button" className="linklike" onClick={p.onOpenCustomer}>
                      Open customer profile
                    </button>
                  ) : (
                    <a href={p.customerHref}>Open customer profile</a>
                  )}
                </p>
              )}
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
        <section className="panel" data-tour="recommendation">
          <div className="panel__head">
            <h2>Agent assessment</h2>
            {run && (
              <span className="nowrap">
                {run.model}, policy v{run.policyVersion}
              </span>
            )}
          </div>
          {!run ? (
            <div className="shadow-cover">This alert has not been triaged yet. Run the agent from the queue or with the button on the right.</div>
          ) : !revealed ? (
            <div className="shadow-cover">
              <p style={{ marginBottom: 12 }}>This alert type is in shadow mode (autonomy level 0). Decide first, then compare with the agent. Agreement in shadow mode is how an alert type earns more autonomy.</p>
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
                    <small>{run.outcome === "completed" ? `${Math.round(run.confidence * 100)}% confidence, risk ${run.riskScore}` : `risk ${run.riskScore}`}</small>
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
                      <small className="nowrap">{fmtMs(s.ms)}</small>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </section>

        {/* -------- Decide -------- */}
        <div className="facts" data-tour="decide">
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
                  <button ref={closeBtn} className="btn btn-close" name="outcome" value="close" type="submit" disabled={deciding} aria-keyshortcuts="c">
                    {rec === "close" && revealed ? "Accept close" : "Close"} <kbd>C</kbd>
                  </button>
                  <button ref={escBtn} className="btn btn-danger" name="outcome" value="escalate" type="submit" disabled={deciding} aria-keyshortcuts="e">
                    {rec === "escalate" && revealed ? "Accept escalation" : "Escalate"} <kbd>E</kbd>
                  </button>
                </div>
                <label className="field">
                  <span>Reason code</span>
                  <select name="reasonCode" defaultValue="" ref={reasonRef} aria-keyshortcuts="o">
                    <option value="">None</option>
                    {p.reasons.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <small>Required when you disagree with the agent. Press O to jump here.</small>
                </label>
                <label className="field">
                  <span>Note</span>
                  <textarea name="note" rows={3} placeholder="Optional. Goes into the audit log." />
                </label>
                {(goNext || p.nav) && (
                  <label className="check">
                    <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Open the next alert after I decide
                  </label>
                )}
                <InlineError state={decState} />
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
                    <input type="hidden" name="seconds" ref={secRef2} defaultValue="0" />
                    <p className="decide__hint">The 30-day SAR clock starts when an investigator determines the activity is suspicious, not when the alert fired. With no suspect identified it extends to 60 days.</p>
                    <label className="check">
                      <input type="checkbox" name="noSuspect" /> No suspect identified yet (60 days)
                    </label>
                    <button className="btn btn-danger" type="submit" disabled={marking}>
                      Mark suspicious and start the clock
                    </button>
                    <InlineError state={susState} />
                  </form>
                ) : null}
                <form action={sar} className="decide">
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
                  <InlineError state={sarState} />
                </form>
              </div>
            </section>
          )}

          {p.collab && p.actions.addNote && (
            <NotesThread
              notes={p.collab.notes}
              members={p.collab.members}
              pending={noting}
              inputRef={notesRef}
              canHandoff={open || alert.status === "escalated"}
              onAdd={(body, _mentions, kind) => submitWith(addNote, { alertId: alert.id, body, kind })}
            />
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
                  <dd className="break">{run.agentIdentity}</dd>
                  <dt>Model</dt>
                  <dd>
                    {run.model} ({run.provider})
                  </dd>
                  <dt>Policy</dt>
                  <dd>v{run.policyVersion}</dd>
                  {run.promptVersion && (
                    <>
                      <dt>Prompt</dt>
                      <dd className="num">{run.promptVersion}</dd>
                    </>
                  )}
                  <dt>Ran at</dt>
                  <dd>
                    <Time value={run.startedAt} />
                  </dd>
                  <dt>Tokens</dt>
                  <dd>
                    {run.inputTokens.toLocaleString()} in, {run.outputTokens.toLocaleString()} out
                  </dd>
                  <dt>Model cost</dt>
                  <dd>
                    <span className="nowrap">${(run.costMicros / 1_000_000).toFixed(4)}</span>
                    {run.costEstimated ? " (estimated at Claude Sonnet 5.5 list price)" : ""}
                  </dd>
                </dl>
                {open && (
                  <form action={rerun} style={{ marginTop: 12 }}>
                    <input type="hidden" name="alertId" value={alert.id} />
                    <button className="btn btn-outline btn-small" type="submit" disabled={rerunning}>
                      {rerunning ? "Running" : modelConfig && p.demo ? `Run again on ${modelConfig.provider === "anthropic" ? "your Anthropic key" : "your OpenAI key"}` : "Run the agent again"}
                    </button>
                    <InlineError state={rerunState} />
                  </form>
                )}
                {p.demo && (
                  <p className="decide__hint" style={{ marginTop: 10 }}>
                    {modelConfig ? "Your own model key is set in this browser." : "This run used the rules model. Add your own Anthropic or OpenAI key to run a live model from your browser."}{" "}
                    <button type="button" className="linklike" onClick={() => setKeyOpen(true)}>
                      {modelConfig ? "Change key" : "Use my own key"}
                    </button>
                  </p>
                )}
                {p.runHistory.length > 1 && (
                  <details className="disclose" style={{ marginTop: 8 }}>
                    <summary style={{ padding: "8px 0" }}>Earlier runs ({p.runHistory.length - 1})</summary>
                    <ul className="cases">
                      {p.runHistory.slice(1).map((h) => (
                        <li key={h.id}>
                          {h.id}: {REC_LABEL[h.recommendation as keyof typeof REC_LABEL]}
                          <span>
                            <Time value={h.at} />, {h.model}, policy v{h.policyVersion}
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
                        {d.actorName}, <Time value={d.createdAt} />
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
      <section className="panel evidence" aria-label="Transactions" data-tour="evidence">
        <div className="panel__head">
          <h2>Transactions</h2>
          <div className="evidence__tools">
            <div className="seg" role="tablist" aria-label="Evidence view">
              {(
                [
                  ["table", "Table"],
                  ["timeline", "Timeline"],
                  ["network", "Counterparties"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} aria-controls={`ev-${k}`} id={`ev-tab-${k}`} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            <span>
              {p.transactions.length} in the last 90 days, {p.historyCount} older{p.historyCited.length ? ` (${p.historyCited.length} cited shown)` : ""}
            </span>
            {tab === "table" && (
              <label className="check">
                <input type="checkbox" checked={!showAll} onChange={(e) => setShowAll(!e.target.checked)} /> Only triggering and highlighted
              </label>
            )}
          </div>
        </div>
        {tab === "table" && (
          <div className="table-wrap" id="ev-table" role="tabpanel" aria-labelledby="ev-tab-table" style={{ maxHeight: 520, overflowY: "auto" }}>
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
                    <td className="num nowrap">
                      <Time value={t.ts} />
                    </td>
                    <td className="nowrap">
                      {CHANNEL[t.channel] ?? t.channel} {t.direction === "in" ? "in" : "out"}
                    </td>
                    <td>
                      {t.counterpartyName ?? t.branch ?? ""}
                      {t.counterpartyCountry && t.counterpartyCountry !== "US" ? ` (${t.counterpartyCountry})` : ""}
                      {t.counterpartyName && t.branch ? <span className="cell-sub">{t.branch}</span> : null}
                    </td>
                    <td>
                      {t.memo ? (
                        <span className={`memo ${injected.has(t.id) ? "memo--flag" : ""}`} title={t.memo}>
                          {injected.has(t.id) ? `Untrusted: ${t.memo}` : t.memo}
                        </span>
                      ) : null}
                    </td>
                    <td className="r num nowrap" style={{ color: t.direction === "out" ? "var(--ink-2)" : undefined }}>
                      {t.direction === "out" ? "-" : ""}
                      {money(t.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "timeline" && (
          <div className="panel__body" id="ev-timeline" role="tabpanel" aria-labelledby="ev-tab-timeline">
            <TransactionTimeline transactions={vizTxns} triggeredIds={alert.triggeredTxnIds} highlightedIds={activeIds} alertCreatedAt={alert.createdAt} onSelect={(id) => citeOnly([id])} />
          </div>
        )}
        {tab === "network" && (
          <div className="panel__body" id="ev-network" role="tabpanel" aria-labelledby="ev-tab-network">
            <CounterpartyGraph customerName={customer.name} transactions={vizTxns} highRiskCountries={p.highRiskCountries ?? DEFAULT_HIGH_RISK_COUNTRIES} highlightedIds={activeIds} onSelect={(ids) => citeOnly(ids)} />
          </div>
        )}
      </section>

      {p.ask && run && revealed && (
        <div style={{ marginTop: 16 }}>
          <AskAgent ctx={p.ask} modelConfig={modelConfig} onCite={(ids) => citeOnly(ids)} onConfigure={() => setKeyOpen(true)} />
        </div>
      )}

      {sarInput && (
        <div style={{ marginTop: 16 }}>
          <SarEditor input={sarInput} />
        </div>
      )}

      {p.demo && <p className="decide__hint" style={{ marginTop: 10 }}>All names, businesses and watchlist entries in this demo are invented.</p>}
      <ModelKeyDialog
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        onSaved={(cfg) => {
          setKeyOpen(false);
          if (cfg) p.onModelSaved?.();
        }}
      />
    </>
  );
}
