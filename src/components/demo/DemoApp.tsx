"use client";

/**
 * Browser-only version of the workbench for static hosting (GitHub Pages).
 * Same scenarios, same triage engine, same policy rules and same components as
 * the server app; state lives in memory and resets on reload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertWorkspace } from "@/components/app/AlertWorkspace";
import { NorthStarChart } from "@/components/app/NorthStarChart";
import { QueueTable } from "@/components/app/QueueTable";
import { Wordmark } from "@/components/Wordmark";
import type { ActionState } from "@/lib/action-types";
import type { AlertStatus, DecisionAction, Typology } from "@/lib/db/schema";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { syntheticRollups } from "@/lib/demo/rollups";
import { buildScenarios, type Scenario } from "@/lib/demo/scenarios";
import { computeFindings } from "@/lib/engine/detectors";
import { runTriage } from "@/lib/engine/pipeline";
import { AUTONOMY_LEVELS, DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import type { TriageResult, WatchlistRecord } from "@/lib/engine/types";
import { ACTION_LABEL, fmtDateTime, OVERRIDE_REASONS, REC_LABEL, TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";
import { aggregateTypologies, aggregateWeeks, HUMAN_DISAGREEMENT_BASELINE, L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { DAY, HOUR, newId, prng } from "@/lib/util";

const ACTOR = "You (demo analyst)";
const AGENT = "triage-agent@demo";
const settings = DEFAULT_POLICY;

interface Run extends TriageResult {
  id: string;
  startedAt: Date;
}
interface Decision {
  id: string;
  actorType: "human" | "agent";
  actorName: string;
  action: DecisionAction;
  reasonCode: string | null;
  note: string | null;
  createdAt: Date;
}
interface DemoAlert {
  id: string;
  s: Scenario;
  status: AlertStatus;
  createdAt: Date;
  slaDueAt: Date;
  suspicionDeterminedAt: Date | null;
  sarDueAt: Date | null;
  runs: Run[];
  decisions: Decision[];
}
interface Qa {
  id: string;
  alertId: string;
  typology: Typology;
  result: "agree" | "disagree" | null;
  note: string | null;
}
interface Audit {
  seq: number;
  ts: Date;
  actorType: string;
  actorName: string;
  action: string;
  entityId: string;
  detail: string;
  prevHash: string;
  hash: string;
}
interface State {
  alerts: DemoAlert[];
  qa: Qa[];
  audit: Audit[];
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type View = { name: "queue"; filter: "open" | "closed" | "escalated" } | { name: "alert"; id: string } | { name: "l2" } | { name: "qa" } | { name: "metrics" } | { name: "audit" };

const latest = (a: DemoAlert) => a.runs[0];
const isOpen = (s: AlertStatus) => s === "new" || s === "triaged" || s === "locked";
const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");

export function DemoApp() {
  const [state, setState] = useState<State | null>(null);
  const [view, setView] = useState<View>({ name: "queue", filter: "open" });
  const ref = useRef<State | null>(null);
  const auditChain = useRef<Promise<void>>(Promise.resolve());
  const head = useRef({ hash: "0".repeat(64), seq: 0 });
  const seed = useRef(Math.floor(Math.random() * 1e9));
  const watchlist = useRef<WatchlistRecord[]>([]);
  const rollups = useMemo(() => syntheticRollups(prng(seed.current), new Date()), []);

  const commit = useCallback((fn: (s: State) => State) => {
    setState((prev) => {
      const next = fn(prev!);
      ref.current = next;
      return next;
    });
  }, []);

  const audit = useCallback(
    (e: { actorType: string; actorName: string; action: string; entityId: string; detail: string; ts?: Date }) => {
      auditChain.current = auditChain.current.then(async () => {
        // The chain head lives in a ref so appends never read state React has not applied yet.
        const prevHash = head.current.hash;
        const seq = head.current.seq + 1;
        const ts = e.ts ?? new Date();
        const hash = await sha256(prevHash + JSON.stringify({ ...e, ts: ts.toISOString() }));
        head.current = { hash, seq };
        commit((s) => ({ ...s, audit: [...s.audit, { ...e, ts, seq, prevHash, hash }] }));
      });
      return auditChain.current;
    },
    [commit],
  );

  // Build the workspace: synthetic scenarios, triaged by the real engine in the browser.
  useEffect(() => {
    (async () => {
      const now = new Date();
      const { open, recentlyClosed, watchlist: wl } = buildScenarios(prng(seed.current), now);
      watchlist.current = wl;
      const provider = new SimulatedProvider();
      const alerts: DemoAlert[] = [];
      const qa: Qa[] = [];
      for (const [i, s] of [...recentlyClosed, ...open].entries()) {
        const id = newId("ALT");
        const result = await runTriage(scenarioToBundle(s, wl, id), settings, provider);
        const run: Run = { ...result, id: newId("RUN"), startedAt: new Date(s.alert.createdAt.getTime() + 120_000) };
        const closed = i < recentlyClosed.length;
        alerts.push({
          id,
          s,
          status: closed ? "closed" : result.outcome === "locked" ? "locked" : "triaged",
          createdAt: s.alert.createdAt,
          slaDueAt: new Date(s.alert.createdAt.getTime() + settings.internalSlaDays * DAY),
          suspicionDeterminedAt: null,
          sarDueAt: null,
          runs: [run],
          decisions: closed
            ? [{ id: newId("DEC"), actorType: "human", actorName: "Jordan Lee (L1 analyst)", action: "batch_close", reasonCode: null, note: null, createdAt: new Date(s.alert.createdAt.getTime() + 20 * HOUR) }]
            : [],
        });
        if (closed) qa.push({ id: newId("QA"), alertId: id, typology: s.alert.typology, result: null, note: null });
      }
      const initial: State = { alerts, qa, audit: [] };
      ref.current = initial;
      setState(initial);
      const ordered = [...alerts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (const a of ordered) {
        const r = latest(a);
        await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityId: a.id, detail: `${r.recommendation}, ${r.model}, policy v${settings.version}`, ts: r.startedAt });
      }
    })();
  }, [audit]);

  /* ---------------- actions (same rules as src/lib/workflow.ts) ---------------- */

  const find = (id: string) => ref.current!.alerts.find((a) => a.id === id)!;
  const update = (id: string, fn: (a: DemoAlert) => DemoAlert) => commit((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === id ? fn(a) : a)) }));

  const decide = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const outcome = str(fd, "outcome") as "close" | "escalate";
    if (!isOpen(a.status)) return { error: `This alert is already ${a.status.replace("_", " ")}.` };
    const r = latest(a);
    const agrees = r.recommendation === outcome || (r.recommendation === "human_review" && r.modelRecommendation === outcome);
    const override = r.recommendation !== "human_review" && !agrees;
    const reasonCode = str(fd, "reasonCode") || null;
    if (override && !reasonCode) return { error: "Choose a reason code to override the agent's recommendation." };
    const action: DecisionAction = outcome === "close" ? (agrees ? "accept_close" : "override_to_close") : agrees ? "accept_escalate" : "override_to_escalate";
    update(a.id, (x) => ({ ...x, status: outcome === "close" ? "closed" : "escalated", decisions: [...x.decisions, { id: newId("DEC"), actorType: "human", actorName: ACTOR, action, reasonCode, note: str(fd, "note") || null, createdAt: new Date() }] }));
    if (outcome === "close" && r.recommendation === "close" && Math.random() < settings.qaSampleRate) {
      commit((s) => ({ ...s, qa: [...s.qa, { id: newId("QA"), alertId: a.id, typology: a.s.alert.typology, result: null, note: null }] }));
    }
    await audit({ actorType: "human", actorName: ACTOR, action: `l1.${action}`, entityId: a.id, detail: reasonCode ? `reason: ${reasonCode}` : `agent said ${r.recommendation}` });
    return { ok: outcome === "close" ? "Closed." : "Escalated to L2." };
  };

  const batch = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const ids = fd.getAll("alertId").map(String);
    const eligible = ids.map(find).filter((a) => a.status === "triaged" && latest(a).batchEligible);
    if (!eligible.length) return { error: "None of the selected alerts are eligible for batch approval." };
    const n = Math.max(1, Math.ceil(eligible.length * settings.qaSampleRate));
    const sampled = new Set([...eligible].sort(() => Math.random() - 0.5).slice(0, n).map((a) => a.id));
    const now = new Date();
    commit((s) => ({
      ...s,
      alerts: s.alerts.map((a) => (eligible.some((e) => e.id === a.id) ? { ...a, status: "closed", decisions: [...a.decisions, { id: newId("DEC"), actorType: "human", actorName: ACTOR, action: "batch_close", reasonCode: null, note: null, createdAt: now }] } : a)),
      qa: [...s.qa, ...eligible.filter((a) => sampled.has(a.id)).map((a) => ({ id: newId("QA"), alertId: a.id, typology: a.s.alert.typology, result: null, note: null }))],
    }));
    await audit({ actorType: "human", actorName: ACTOR, action: "l1.batch_close", entityId: `${eligible.length} alerts`, detail: `${sampled.size} sampled for QA` });
    return { ok: `Closed ${eligible.length} alerts. ${sampled.size} sampled for QA.` };
  };

  const markSuspicious = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    if (a.status !== "escalated") return { error: "Only escalated alerts can be marked suspicious." };
    const now = new Date();
    const due = new Date(now.getTime() + (fd.get("noSuspect") === "on" ? 60 : 30) * DAY);
    update(a.id, (x) => ({ ...x, suspicionDeterminedAt: now, sarDueAt: due }));
    await audit({ actorType: "human", actorName: ACTOR, action: "l2.suspicion_determined", entityId: a.id, detail: `SAR due ${due.toISOString().slice(0, 10)}` });
    return { ok: `SAR clock started. Due ${due.toISOString().slice(0, 10)}.` };
  };

  const sarDecision = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const file = str(fd, "decision") === "file";
    if (a.status !== "escalated") return { error: "Only escalated alerts can receive a SAR decision." };
    if (file && !a.suspicionDeterminedAt) return { error: "Mark the activity suspicious before recording a SAR filing." };
    update(a.id, (x) => ({ ...x, status: file ? "sar_filed" : "no_sar", decisions: [...x.decisions, { id: newId("DEC"), actorType: "human", actorName: ACTOR, action: file ? "sar_file" : "sar_no_file", reasonCode: null, note: str(fd, "note") || null, createdAt: new Date() }] }));
    await audit({ actorType: "human", actorName: ACTOR, action: file ? "l2.sar_filed" : "l2.closed_no_sar", entityId: a.id, detail: str(fd, "note") });
    return { ok: file ? "SAR filing recorded." : "Closed with no SAR." };
  };

  const rerun = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const result = await runTriage(scenarioToBundle(a.s, watchlist.current, a.id), settings, new SimulatedProvider());
    const run: Run = { ...result, id: newId("RUN"), startedAt: new Date() };
    update(a.id, (x) => ({ ...x, runs: [run, ...x.runs], status: result.outcome === "locked" ? "locked" : "triaged" }));
    await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityId: a.id, detail: `re-run: ${result.recommendation}` });
    return { ok: `Re-run complete: ${result.recommendation.replace("_", " ")}.` };
  };

  const reviewQa = async (id: string, result: "agree" | "disagree", note: string) => {
    commit((s) => ({ ...s, qa: s.qa.map((q) => (q.id === id ? { ...q, result, note } : q)) }));
    const q = ref.current!.qa.find((x) => x.id === id)!;
    await audit({ actorType: "human", actorName: ACTOR, action: `qa.${result}`, entityId: q.alertId, detail: note });
  };

  if (!state) {
    return (
      <div className="empty" style={{ maxWidth: 520, margin: "20vh auto" }}>
        <h2>Setting up your demo workspace</h2>
        <p>Generating 44 synthetic alerts and running the triage agent on each one, in your browser.</p>
      </div>
    );
  }

  const open = state.alerts.filter((a) => isOpen(a.status));
  const l2 = state.alerts.filter((a) => a.status === "escalated");
  const qaPending = state.qa.filter((q) => !q.result);
  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const NAV: { label: string; v: View; count?: number }[] = [
    { label: "Alert queue", v: { name: "queue", filter: "open" }, count: open.length },
    { label: "L2 investigations", v: { name: "l2" }, count: l2.length },
    { label: "QA review", v: { name: "qa" }, count: qaPending.length },
    { label: "Metrics", v: { name: "metrics" } },
    { label: "Audit log", v: { name: "audit" } },
  ];
  const current = (v: View) => v.name === view.name || (v.name === "queue" && view.name === "alert");

  return (
    <div className="app">
      <aside className="app-side">
        <a href="../" className="app-side__brand" aria-label="Assay home">
          <Wordmark size={19} />
        </a>
        <div className="app-side__ws">
          <strong>Acme Financial (synthetic)</strong>
          <span>Demo workspace, policy v{settings.version}</span>
        </div>
        <nav className="app-nav" aria-label="Workbench">
          {NAV.map((n) => (
            <a key={n.label} href="#" aria-current={current(n.v) ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(n.v))}>
              {n.label}
              {n.count ? <span className="count">{n.count}</span> : null}
            </a>
          ))}
        </nav>
        <div className="app-side__foot">
          <span>Signed in as {ACTOR}</span>
          <a href="../">Back to the website</a>
        </div>
      </aside>
      <div className="app-main">
        <div className="demo-bar" role="status">
          <span>Demo running in your browser on synthetic data. The engine, policy rules and audit chain are the real ones. Reloading the page starts a fresh workspace.</span>
        </div>
        <div className="app-content">
          {view.name === "queue" && <QueueView state={state} filter={view.filter} setFilter={(f) => go({ name: "queue", filter: f })} open={(id) => go({ name: "alert", id })} batch={batch} />}
          {view.name === "alert" && (
            <AlertView key={view.id + state.alerts.find((a) => a.id === view.id)!.runs.length} a={state.alerts.find((a) => a.id === view.id)!} watchlist={watchlist.current} back={() => go({ name: "queue", filter: "open" })} actions={{ decide, markSuspicious, sarDecision, rerun }} />
          )}
          {view.name === "l2" && <L2View alerts={l2} open={(id) => go({ name: "alert", id })} />}
          {view.name === "qa" && <QaView state={state} review={reviewQa} open={(id) => go({ name: "alert", id })} />}
          {view.name === "metrics" && <MetricsView rollups={rollups} state={state} />}
          {view.name === "audit" && <AuditView audit={state.audit} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- views ---------------- */

function QueueView({ state, filter, setFilter, open, batch }: { state: State; filter: "open" | "closed" | "escalated"; setFilter: (f: "open" | "closed" | "escalated") => void; open: (id: string) => void; batch: (p: ActionState, fd: FormData) => Promise<ActionState> }) {
  const statuses: Record<string, AlertStatus[]> = { open: ["new", "triaged", "locked"], closed: ["closed", "no_sar"], escalated: ["escalated", "sar_filed"] };
  const list = state.alerts.filter((a) => statuses[filter].includes(a.status)).sort((x, y) => latest(y).riskScore - latest(x).riskScore);
  const openList = state.alerts.filter((a) => isOpen(a.status));
  const shadow = Object.fromEntries(TYPOLOGIES.map((t) => [t, settings.autonomy[t] === 0])) as Record<Typology, boolean>;
  const rows = list.map((a) => {
    const r = latest(a);
    return {
      id: a.id,
      ruleCode: a.s.alert.ruleCode,
      ruleDescription: a.s.alert.ruleDescription,
      typology: a.s.alert.typology,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      slaDueAt: a.slaDueAt.toISOString(),
      sarDueAt: a.sarDueAt?.toISOString() ?? null,
      customerName: a.s.customer.name,
      customerKind: a.s.customer.kind,
      recommendation: r.recommendation,
      modelRecommendation: r.modelRecommendation,
      confidence: r.confidence,
      riskScore: r.riskScore,
      batchEligible: r.batchEligible,
      outcome: r.outcome,
    };
  });
  const count = (rec: string) => openList.filter((a) => latest(a).recommendation === rec).length;
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Alert queue</h1>
          <p>Sorted by agent risk score. Open an alert to see the evidence behind each claim.</p>
        </div>
      </div>
      {filter === "open" && (
        <div className="panel summary">
          <div className="summary__item">
            <b>{openList.length}</b>
            <span>open alerts</span>
          </div>
          <div className="summary__item">
            <b style={{ color: "var(--green)" }}>{count("close")}</b>
            <span>recommended close</span>
          </div>
          <div className="summary__item">
            <b style={{ color: "var(--red)" }}>{count("escalate")}</b>
            <span>recommended escalate</span>
          </div>
          <div className="summary__item">
            <b style={{ color: "var(--amber)" }}>{count("human_review")}</b>
            <span>need your judgment</span>
          </div>
        </div>
      )}
      <div className="filters">
        {(["open", "closed", "escalated"] as const).map((f) => (
          <a key={f} href="#" aria-current={filter === f ? "true" : undefined} onClick={(e) => (e.preventDefault(), setFilter(f))}>
            {f[0].toUpperCase() + f.slice(1)}
          </a>
        ))}
      </div>
      <QueueTable
        key={filter + rows.length}
        rows={rows}
        shadow={shadow}
        batchableCount={filter === "open" ? openList.filter((a) => a.status === "triaged" && latest(a).batchEligible).length : 0}
        qaRate={settings.qaSampleRate}
        selectable={filter === "open"}
        batchAction={batch}
        alertHref={(id) => `#${id}`}
        onOpen={open}
      />
    </>
  );
}

function AlertView({ a, watchlist, back, actions }: { a: DemoAlert; watchlist: WatchlistRecord[]; back: () => void; actions: { decide: (p: ActionState, f: FormData) => Promise<ActionState>; markSuspicious: (p: ActionState, f: FormData) => Promise<ActionState>; sarDecision: (p: ActionState, f: FormData) => Promise<ActionState>; rerun: (p: ActionState, f: FormData) => Promise<ActionState> } }) {
  const bundle = scenarioToBundle(a.s, watchlist, a.id);
  const findings = computeFindings(bundle, settings);
  const run = latest(a);
  const cited = new Set(run.rationale.flatMap((r) => r.citations));
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return (
    <>
      <p style={{ marginBottom: 10, fontSize: 13.5 }}>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            back();
          }}
        >
          Alert queue
        </a>
      </p>
      <AlertWorkspace
        actions={actions}
        alert={{ id: a.id, externalId: null, ruleCode: a.s.alert.ruleCode, ruleDescription: a.s.alert.ruleDescription, typology: a.s.alert.typology, status: a.status, createdAt: a.createdAt.toISOString(), slaDueAt: a.slaDueAt.toISOString(), suspicionDeterminedAt: iso(a.suspicionDeterminedAt), sarDueAt: iso(a.sarDueAt), triggeredTxnIds: a.s.alert.triggeredTxnIds, source: "seed" }}
        customer={{ ...bundle.customer, onboardedAt: iso(bundle.customer.onboardedAt) }}
        transactions={[...bundle.transactions].reverse().map((t) => ({ ...t, ts: t.ts.toISOString() }))}
        historyCited={bundle.history.filter((h) => cited.has(h.id)).map((t) => ({ ...t, ts: t.ts.toISOString() }))}
        historyCount={bundle.history.length}
        priorCases={bundle.priorCases.map((c) => ({ ...c, openedAt: c.openedAt.toISOString() }))}
        watchlistHits={findings.watchlistHits}
        injectionTxnIds={findings.injection.map((h) => h.txnId)}
        run={{
          id: run.id,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.startedAt.toISOString(),
          agentIdentity: AGENT,
          provider: run.provider,
          model: run.model,
          policyVersion: settings.version,
          outcome: run.outcome,
          modelRecommendation: run.modelRecommendation,
          recommendation: run.recommendation,
          confidence: run.confidence,
          riskScore: run.riskScore,
          rationale: run.rationale,
          trace: run.trace,
          policyHits: run.policyHits,
          validation: run.validation,
          narrative: run.narrative,
          batchEligible: run.batchEligible,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          costMicros: run.costMicros,
          costEstimated: run.costEstimated,
        }}
        runHistory={a.runs.map((r) => ({ id: r.id, at: r.startedAt.toISOString(), model: r.model, policyVersion: settings.version, recommendation: r.recommendation }))}
        decisions={a.decisions.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
        shadow={false}
        reasons={OVERRIDE_REASONS.map((r) => ({ ...r }))}
        demo
      />
    </>
  );
}

function L2View({ alerts, open }: { alerts: DemoAlert[]; open: (id: string) => void }) {
  return (
    <>
      <div className="app-head">
        <div>
          <h1>L2 investigations</h1>
          <p>Escalated alerts. The SAR clock starts when an investigator marks the activity suspicious, and only a person can record a SAR decision.</p>
        </div>
      </div>
      <section className="panel">
        {alerts.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Customer</th>
                <th>Type</th>
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
                  <td>{a.sarDueAt ? `Due ${a.sarDueAt.toISOString().slice(0, 10)}` : "Not started"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <h2>No escalations yet</h2>
            <p>Escalate an alert from the queue and it lands here with the agent&apos;s draft narrative attached.</p>
          </div>
        )}
      </section>
    </>
  );
}

function QaView({ state, review, open }: { state: State; review: (id: string, r: "agree" | "disagree", note: string) => Promise<void>; open: (id: string) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <div className="app-head">
        <div>
          <h1>QA review</h1>
          <p>A sample of agent-assisted closes, drawn at {Math.round(settings.qaSampleRate * 100)}% from every batch. Agreement here is what earns an alert type more autonomy.</p>
        </div>
      </div>
      {err && <p className="form-error toast">{err}</p>}
      <section className="panel">
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
              const a = state.alerts.find((x) => x.id === q.alertId)!;
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
                  <td style={{ minWidth: 280 }}>
                    {q.result ? (
                      <span className={q.result === "agree" ? "ok" : "warn"}>{q.result === "agree" ? "Agree" : `Disagree: ${q.note}`}</span>
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        <input type="text" placeholder="Note (required to disagree)" value={notes[q.id] ?? ""} onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-close btn-small" onClick={() => (setErr(null), review(q.id, "agree", notes[q.id] ?? ""))}>
                            Agree
                          </button>
                          <button
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
      </section>
    </>
  );
}

const pct = (x: number | null, d = 1) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);

function MetricsView({ rollups, state }: { rollups: ReturnType<typeof syntheticRollups>; state: State }) {
  const weeks = aggregateWeeks(rollups);
  const types = aggregateTypologies(rollups);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const baseline = avg(weeks.filter((w) => w.mode === "manual" && w.hoursPerSar).map((w) => w.hoursPerSar!));
  const recent = avg(weeks.filter((w) => w.mode === "assisted" && w.hoursPerSar).slice(-2).map((w) => w.hoursPerSar!));
  const assisted = weeks.filter((w) => w.mode === "assisted");
  const qaS = assisted.reduce((s, w) => s + w.qaSampled, 0);
  const missed = qaS ? assisted.reduce((s, w) => s + w.missed, 0) / qaS : null;
  const acc = assisted.reduce((s, w) => s + w.accepted, 0);
  const ovr = assisted.reduce((s, w) => s + w.overridden, 0);
  const overrideRate = acc + ovr ? ovr / (acc + ovr) : null;
  const runs = state.alerts.map(latest);
  const completed = runs.filter((r) => r.outcome === "completed");
  const avgCost = runs.reduce((s, r) => s + r.costMicros, 0) / runs.length / 1e6;
  const decisions = state.alerts.flatMap((a) => a.decisions.filter((d) => d.actorName === ACTOR));
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Metrics</h1>
          <p>The north star is analyst hours per confirmed suspicious case: all L1 and L2 time divided by escalations that end in a SAR. It falls when noise clears faster, and rises if the agent buries real cases or pushes work onto L2.</p>
        </div>
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
                    <td>
                      L{settings.autonomy[t.typology]} {AUTONOMY_LEVELS[settings.autonomy[t.typology]].name}
                    </td>
                    <td className="r num">{t.alerts.toLocaleString()}</td>
                    <td className="r num">{pct(t.shadowAgreement)}</td>
                    <td className="r num">{pct(t.qaAgreement)}</td>
                    <td>
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

function AuditView({ audit }: { audit: Audit[] }) {
  const [check, setCheck] = useState<string>("Verifying");
  useEffect(() => {
    (async () => {
      let prev = "0".repeat(64);
      for (const e of audit) {
        const { seq: _s, prevHash: _p, hash: _h, ...body } = e;
        void _s;
        void _p;
        void _h;
        const expected = await sha256(prev + JSON.stringify({ ...body, ts: e.ts.toISOString() }));
        if (e.prevHash !== prev || e.hash !== expected) return setCheck(`Chain broken at event ${e.seq}`);
        prev = e.hash;
      }
      setCheck(`Chain verified: ${audit.length} events, no breaks. Head hash ${prev.slice(0, 16)}...`);
    })();
  }, [audit]);
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Audit log</h1>
          <p>Append-only. Each event stores the SHA-256 hash of the event before it, so an edit or deletion anywhere breaks the chain from that point on.</p>
        </div>
      </div>
      <div className="panel chain">
        <span className="ok">{check}</span>
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
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {fmtDateTime(e.ts)}
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
