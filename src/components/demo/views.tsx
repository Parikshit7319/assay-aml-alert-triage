"use client";

import { useEffect, useMemo, useState } from "react";
import { NorthStarChart } from "@/components/app/NorthStarChart";
import type { Channel } from "@/components/viz/helpers";
import { TeamWorkload } from "@/components/workbench/Assignment";
import { Customer360 } from "@/components/workbench/Customer360";
import { ExportMenu, type ExportMenuItem } from "@/components/workbench/ExportMenu";
import { PolicyEditor } from "@/components/workbench/PolicyEditor";
import { ShadowView } from "@/components/workbench/ShadowView";
import { Time } from "@/components/workbench/Time";
import type { PolicySettings } from "@/lib/db/schema";
import { syntheticRollups } from "@/lib/demo/rollups";
import { buildShadowSet, type ShadowRow } from "@/lib/demo/shadow";
import { AUTONOMY_LEVELS, DEFAULT_HIGH_RISK_COUNTRIES } from "@/lib/engine/policy";
import { ACTION_LABEL, REC_LABEL, TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";
import { aggregateTypologies, aggregateWeeks, HUMAN_DISAGREEMENT_BASELINE, L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { DAY } from "@/lib/util";
import { type Audit, type DemoAlert, isOpen, latest, ME, type State, TEAM, verifyChain } from "./demo-state";

const pct = (x: number | null, d = 1) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);

export function L2View({ alerts, open }: { alerts: DemoAlert[]; open: (id: string) => void }) {
  return (
    <>
      <div className="app-head">
        <div>
          <h1>L2 investigations</h1>
          <p>Escalated alerts. The SAR clock starts when an investigator marks the activity suspicious, and only a person can record a SAR decision.</p>
        </div>
      </div>
      <section className="panel table-wrap">
        {alerts.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Handoff notes</th>
                <th>SAR clock</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a className="row-link num" href="#" onClick={(e) => (e.preventDefault(), open(a.id))}>
                      {a.id}
                    </a>
                  </td>
                  <td>{a.s.customer.name}</td>
                  <td>{TYPOLOGY_LABEL[a.s.alert.typology]}</td>
                  <td>{a.notes.filter((n) => n.kind === "handoff").length || <span className="cell-sub">None</span>}</td>
                  <td className="nowrap">{a.sarDueAt ? <>Due <Time value={a.sarDueAt} format="date" /></> : "Not started"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <h2>No escalations yet</h2>
            <p>Escalate an alert from the queue and it lands here with the agent&apos;s draft narrative and SAR draft attached.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function QaView({ state, review, open }: { state: State; review: (id: string, r: "agree" | "disagree", note: string) => Promise<void>; open: (id: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const done = state.qa.filter((q) => q.result);
  const agree = done.filter((q) => q.result === "agree").length;
  return (
    <>
      <div className="app-head">
        <div>
          <h1>QA review</h1>
          <p>
            A sample of agent-assisted closes, drawn at {Math.round(state.settings.qaSampleRate * 100)}% from every batch. Agreement here is what earns an alert type more autonomy.
          </p>
        </div>
        <div className="summary__item">
          <b>{done.length ? pct(agree / done.length, 0) : "n/a"}</b>
          <span>
            agreement, {done.length} of {state.qa.length} reviewed
          </span>
        </div>
      </div>
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <section className="panel table-wrap">
        {state.qa.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Type</th>
                <th>Agent</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {state.qa.map((q) => {
                const a = state.alerts.find((x) => x.id === q.alertId);
                if (!a) return null;
                const r = latest(a);
                return (
                  <tr key={q.id}>
                    <td>
                      <a className="row-link num" href="#" onClick={(e) => (e.preventDefault(), open(a.id))}>
                        {a.id}
                      </a>
                      <span className="cell-sub">{a.s.customer.name}</span>
                    </td>
                    <td>{TYPOLOGY_LABEL[q.typology]}</td>
                    <td>
                      <span className={`rec rec-${r.recommendation}`}>
                        {REC_LABEL[r.recommendation]} {Math.round(r.confidence * 100)}%
                      </span>
                    </td>
                    <td style={{ minWidth: 260 }}>
                      {q.result ? (
                        <span className={q.result === "agree" ? "ok" : "warn"}>{q.result === "agree" ? "Agree" : `Disagree: ${q.note}`}</span>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          <label className="visually-hidden" htmlFor={`qa-${q.id}`}>
                            QA note for {a.id}
                          </label>
                          <input id={`qa-${q.id}`} type="text" placeholder="Note (required to disagree)" value={notes[q.id] ?? ""} onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })} />
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button type="button" className="btn btn-close btn-small" onClick={() => (setErr(null), review(q.id, "agree", notes[q.id] ?? ""))}>
                              Agree
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-small"
                              onClick={() => {
                                if (!notes[q.id]?.trim()) return setErr("Add a note explaining the disagreement.");
                                setErr(null);
                                review(q.id, "disagree", notes[q.id]);
                              }}
                            >
                              Disagree
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <h2>Nothing sampled yet</h2>
            <p>Approve a batch of closes in the queue and a sample lands here.</p>
          </div>
        )}
      </section>
    </>
  );
}

export function TeamView({ state, openQueue }: { state: State; openQueue: () => void }) {
  const [now] = useState(() => Date.now());
  const weekAgo = now - 7 * DAY;
  const rows = TEAM.map((m) => {
    const mine = state.alerts.filter((a) => a.assigneeId === m.id);
    const openA = mine.filter((a) => isOpen(a.status));
    const oldest = openA.reduce<number | null>((o, a) => {
      const d = Math.floor((now - new Date(a.createdAt).getTime()) / DAY);
      return o == null || d > o ? d : o;
    }, null);
    const decided = state.alerts.reduce((n, a) => n + a.decisions.filter((d) => d.actorName === m.name && new Date(d.createdAt).getTime() >= weekAgo).length, 0);
    return { userId: m.id, name: m.id === ME.id ? `${m.name}` : m.name, role: m.role, open: openA.length, l2: mine.filter((a) => a.status === "escalated").length, decidedLast7d: decided, oldestOpenDays: oldest };
  });
  const unassigned = state.alerts.filter((a) => isOpen(a.status) && !a.assigneeId).length;
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Team workload</h1>
          <p>Who holds what. Assign from an alert (press A to take it) or from the queue&apos;s Owner filter. Four people in this demo team; the other three are synthetic.</p>
        </div>
      </div>
      <TeamWorkload rows={rows} unassigned={unassigned} slaDays={state.settings.internalSlaDays} onSelect={() => openQueue()} />
    </>
  );
}

export function ShadowModeView({ seed }: { seed: number }) {
  const [rows, setRows] = useState<ShadowRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void buildShadowSet(seed, new Date()).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [seed]);
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Shadow mode comparison</h1>
          <p>
            Before an alert type gets any autonomy, the agent runs silently next to your analysts. This compares its recommendation with the human disposition on 160 synthetic historical alerts, triaged by the same engine in your browser. Human dispositions are simulated at per-typology agreement rates; in a pilot they come from your own closed cases.
          </p>
        </div>
      </div>
      {rows ? (
        <ShadowView rows={rows} typologies={TYPOLOGIES} />
      ) : (
        <div className="panel empty" role="status">
          <p>Running 160 historical alerts through the agent.</p>
        </div>
      )}
    </>
  );
}

export function PolicyView({ settings, rerunning, onSave }: { settings: PolicySettings; rerunning: boolean; onSave: (next: PolicySettings, rerun: boolean) => void | Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Policy</h1>
          <p>Deterministic rules that run before and after the model, and the autonomy each alert type has earned. Changing policy is human-only and every save is versioned in the audit log.</p>
        </div>
        <div className="app-tools">
          <span className="cell-sub">Current: v{settings.version}</span>
          <button type="button" className="btn btn-outline btn-small" disabled={!dirty || rerunning} onClick={() => void onSave(draft, false)}>
            Save as v{settings.version + 1}
          </button>
          <button type="button" className="btn btn-small" disabled={rerunning} onClick={() => void onSave(draft, true)}>
            {rerunning ? "Re-running open alerts" : dirty ? "Save and re-run open alerts" : "Re-run open alerts"}
          </button>
        </div>
      </div>
      <PolicyEditor value={draft} onChange={setDraft} onRerun={() => void onSave(draft, true)} rerunning={rerunning} />
    </>
  );
}

export function CustomerView({ state, customerId, back, open }: { state: State; customerId: string; back: () => void; open: (id: string) => void }) {
  const alerts = state.alerts.filter((a) => a.s.customer.id === customerId);
  const first = alerts[0];
  const data = useMemo(() => {
    if (!first) return null;
    const txns = new Map<string, (typeof first.s.transactions)[number]>();
    alerts.forEach((a) => a.s.transactions.forEach((t) => txns.set(t.id, t)));
    const cases = new Map<string, (typeof first.s.priorCases)[number]>();
    alerts.forEach((a) => a.s.priorCases.forEach((c) => cases.set(c.id, c)));
    return {
      transactions: [...txns.values()].map((t) => ({ id: t.id, ts: new Date(t.ts).toISOString(), amountCents: t.amountCents, direction: t.direction, channel: t.channel as Channel, counterpartyName: t.counterpartyName, counterpartyCountry: t.counterpartyCountry, branch: t.branch })),
      priorCases: [...cases.values()],
    };
  }, [alerts, first]);
  if (!first || !data) {
    return (
      <div className="panel empty">
        <h2>Customer not found</h2>
      </div>
    );
  }
  return (
    <>
      <p style={{ marginBottom: 10, fontSize: 13.5 }}>
        <a href="#" onClick={(e) => (e.preventDefault(), back())}>
          Back
        </a>
      </p>
      <Customer360
        customer={first.s.customer}
        alerts={alerts.map((a) => ({ id: a.id, typology: a.s.alert.typology, status: a.status, recommendation: latest(a).recommendation, riskScore: latest(a).riskScore, createdAt: a.createdAt }))}
        transactions={data.transactions}
        priorCases={data.priorCases}
        highRiskCountries={DEFAULT_HIGH_RISK_COUNTRIES}
        onOpenAlert={open}
        triggeredIds={first.s.alert.triggeredTxnIds}
      />
    </>
  );
}

export function MetricsView({ rollups, state, exportPack }: { rollups: ReturnType<typeof syntheticRollups>; state: State; exportPack: () => void }) {
  const weeks = aggregateWeeks(rollups);
  const types = aggregateTypologies(rollups);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const baseline = avg(weeks.filter((w) => w.mode === "manual" && w.hoursPerSar).map((w) => w.hoursPerSar!));
  const recent = avg(
    weeks
      .filter((w) => w.mode === "assisted" && w.hoursPerSar)
      .slice(-2)
      .map((w) => w.hoursPerSar!),
  );
  const assisted = weeks.filter((w) => w.mode === "assisted");
  const qaS = assisted.reduce((s, w) => s + w.qaSampled, 0);
  const missed = qaS ? assisted.reduce((s, w) => s + w.missed, 0) / qaS : null;
  const acc = assisted.reduce((s, w) => s + w.accepted, 0);
  const ovr = assisted.reduce((s, w) => s + w.overridden, 0);
  const overrideRate = acc + ovr ? ovr / (acc + ovr) : null;
  const runs = state.alerts.map(latest);
  const completed = runs.filter((r) => r.outcome === "completed");
  const avgCost = runs.reduce((s, r) => s + r.costMicros, 0) / Math.max(1, runs.length) / 1e6;
  const decisions = state.alerts.flatMap((a) => a.decisions.filter((d) => d.actorName === ME.name));
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Metrics</h1>
          <p>The north star is analyst hours per confirmed suspicious case: all L1 and L2 time divided by escalations that end in a SAR. It falls when noise clears faster, and rises if the agent buries real cases or pushes work onto L2.</p>
        </div>
        <button type="button" className="btn btn-outline btn-small" onClick={exportPack}>
          Model risk documentation
        </button>
      </div>
      <p className="note" style={{ marginBottom: 16 }}>
        Weekly history is synthetic, at the volume of a team with about 15 L1 analysts (roughly 4,000 alerts a month). The runs, cost and your decisions are live from this session.
      </p>
      <div className="metric-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Analyst hours per confirmed suspicious case</h2>
            <span>weekly</span>
          </div>
          <div className="ns-value">
            <b>{recent?.toFixed(1)} h</b>
            <span>{baseline && recent ? `last two assisted weeks, down ${Math.round(((baseline - recent) / baseline) * 100)}% from the ${baseline.toFixed(1)} h manual baseline` : ""}</span>
          </div>
          <div style={{ padding: "0 8px 8px" }}>
            <NorthStarChart points={weeks.map((w) => ({ weekStart: w.weekStart, mode: w.mode, value: w.hoursPerSar, alerts: w.alerts, sars: w.sars, hours: w.l1Hours + w.l2Hours }))} baseline={baseline} />
          </div>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>Guardrails</h2>
            <span>a win only counts if these hold</span>
          </div>
          <ul className="guard">
            <li>
              Missed escalations on QA&apos;d agent closes <b className={missed != null && missed <= HUMAN_DISAGREEMENT_BASELINE ? "ok" : "warn"}>{pct(missed)}</b>
              <small>At or under the {pct(HUMAN_DISAGREEMENT_BASELINE)} human-to-human baseline (modeled).</small>
            </li>
            <li>
              Claims that resolve to a record, this session <b className="ok">{pct(completed.length ? completed.filter((r) => r.validation.valid).length / completed.length : null)}</b>
              <small>Target 100%. Any miss sends the alert to human review.</small>
            </li>
            <li>
              Override rate, assisted weeks <b className={overrideRate != null && overrideRate >= 0.02 && overrideRate <= 0.15 ? "ok" : "warn"}>{pct(overrideRate)}</b>
              <small>Healthy band is 2% to 15%.</small>
            </li>
            <li>
              Injection attempts stopped before the model <b className="ok">{runs.filter((r) => r.outcome === "locked").length}</b>
            </li>
            <li>
              Average model cost per alert <b className="num">${avgCost.toFixed(4)}</b>
              <small>Estimated at Claude Sonnet 5.5 list price. Target under $0.15.</small>
            </li>
            <li>
              Your decisions this session <b className="num">{decisions.length}</b>
            </li>
          </ul>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <h2>Agreement by alert type and progress toward the next autonomy level</h2>
          <span>
            L3 needs {pct(L3_MIN_AGREEMENT, 0)} on {L3_MIN_QA.toLocaleString()} QA-reviewed alerts
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Alert type</th>
                <th>Level</th>
                <th className="r">Alerts</th>
                <th className="r">Shadow agreement</th>
                <th className="r">QA agreement</th>
                <th>QA-reviewed toward L3</th>
              </tr>
            </thead>
            <tbody>
              {types
                .sort((x, y) => y.alerts - x.alerts)
                .map((t) => (
                  <tr key={t.typology}>
                    <td>{TYPOLOGY_LABEL[t.typology]}</td>
                    <td className="nowrap">
                      L{state.settings.autonomy[t.typology]} {AUTONOMY_LEVELS[state.settings.autonomy[t.typology]].name}
                    </td>
                    <td className="r num">{t.alerts.toLocaleString()}</td>
                    <td className="r num">{pct(t.shadowAgreement)}</td>
                    <td className="r num">{pct(t.qaAgreement)}</td>
                    <td className="nowrap">
                      <span className="progress">
                        <i style={{ width: `${Math.min(100, (t.qaSampled / L3_MIN_QA) * 100)}%` }} />
                      </span>{" "}
                      <span className="num">
                        {t.qaSampled} of {L3_MIN_QA.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function AuditView({ audit, exportItems }: { audit: Audit[]; exportItems: ExportMenuItem[] }) {
  const [check, setCheck] = useState<{ text: string; ok: boolean }>({ text: "Verifying", ok: true });
  useEffect(() => {
    let live = true;
    void verifyChain(audit).then((r) => {
      if (!live) return;
      setCheck(r.ok ? { ok: true, text: `Chain verified: ${audit.length} events, no breaks. Head hash ${r.head.slice(0, 16)}...` } : { ok: false, text: `Chain broken at event ${r.brokenAt}` });
    });
    return () => {
      live = false;
    };
  }, [audit]);
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Audit log</h1>
          <p>Append-only. Each event stores the SHA-256 hash of the event before it, so an edit or deletion anywhere breaks the chain from that point on. Same hashing as the server edition, so the JSON export verifies with the same script.</p>
        </div>
        <ExportMenu label="Export" items={exportItems} />
      </div>
      <div className="panel chain" role="status" data-tour="audit">
        <span className={check.ok ? "ok" : "warn"}>{check.text}</span>
      </div>
      <section className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {[...audit].reverse().map((e) => (
              <tr key={e.seq}>
                <td className="r num">{e.seq}</td>
                <td className="num nowrap">
                  <Time value={e.ts} />
                </td>
                <td>
                  {e.actorName}
                  <span className="cell-sub">{e.actorType}</span>
                </td>
                <td>{ACTION_LABEL[e.action.split(".")[1]] ?? e.action}</td>
                <td className="num">{e.entityId}</td>
                <td style={{ fontSize: 13, color: "var(--ink-2)" }}>{e.detail}</td>
                <td className="hash">{e.hash.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
