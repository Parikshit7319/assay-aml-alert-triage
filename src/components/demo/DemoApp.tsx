"use client";

/**
 * Browser-only version of the workbench for static hosting (GitHub Pages).
 * Same scenarios, same triage engine, same policy rules and the same
 * components as the server app. State is saved in this browser and survives a
 * reload until the visitor resets it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertWorkspace } from "@/components/app/AlertWorkspace";
import { QueueTable } from "@/components/app/QueueTable";
import { Wordmark } from "@/components/Wordmark";
import { ResetDemoButton, SavedIndicator } from "@/components/workbench/DemoPersistence";
import { ExportMenu } from "@/components/workbench/ExportMenu";
import { GuidedTour, useTourAutostart } from "@/components/workbench/GuidedTour";
import { ImportPanel } from "@/components/workbench/ImportPanel";
import { LiveFeedControl } from "@/components/workbench/LiveFeedControl";
import { Modal } from "@/components/workbench/overlay";
import { ShortcutHelp } from "@/components/workbench/ShortcutHelp";
import { ToastProvider, useToast } from "@/components/workbench/Toasts";
import { DEMO_TOUR_STEPS, DEMO_TOUR_STORAGE_KEY, resetTour } from "@/components/workbench/tour";
import { useHotkeys } from "@/components/workbench/useHotkeys";
import type { ActionState } from "@/lib/action-types";
import type { DecisionAction, PolicySettings, Typology } from "@/lib/db/schema";
import { track } from "@/lib/analytics-client";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { createLiveFeed, type LiveFeed } from "@/lib/demo/live-feed";
import { clearDemoState, loadDemoState, saveDemoState } from "@/lib/demo/persist";
import { syntheticRollups } from "@/lib/demo/rollups";
import { buildScenarios, type Scenario } from "@/lib/demo/scenarios";
import { computeFindings } from "@/lib/engine/detectors";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_HIGH_RISK_COUNTRIES, DEFAULT_POLICY } from "@/lib/engine/policy";
import { createBrowserProvider } from "@/lib/engine/providers/browser";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { auditToCsv, auditToJson, decisionsToCsv, qaToCsv } from "@/lib/exports/csv";
import { downloadText } from "@/lib/exports/download";
import { buildModelRiskPack } from "@/lib/exports/model-risk";
import { PROMPT_VERSION } from "@/lib/engine/prompt";
import { OVERRIDE_REASONS, TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";
import { aggregateTypologies } from "@/lib/metrics-pure";
import { useModelConfig } from "@/lib/use-model-config";
import { DAY, HOUR, newId, prng } from "@/lib/util";
import { AGENT, auditBody, type Audit, type DemoAlert, isOpen, latest, looksLikeState, ME, type Run, sha256, type State, STORAGE_KEY, str, TEAM, type View, verifyChain, WORKSPACE } from "./demo-state";
import { AuditView, CustomerView, L2View, MetricsView, PolicyView, QaView, ShadowModeView, TeamView } from "./views";

export function DemoApp() {
  return (
    <ToastProvider>
      <DemoWorkspace />
    </ToastProvider>
  );
}

const SHORTCUT_GROUPS = [
  {
    title: "Queue",
    keys: [
      { combo: "j", label: "Next alert" },
      { combo: "k", label: "Previous alert" },
      { combo: "enter", label: "Open the highlighted alert" },
      { combo: "x", label: "Select for batch close" },
      { combo: "/", label: "Search the queue" },
    ],
  },
  {
    title: "Alert",
    keys: [
      { combo: "c", label: "Close (accept or override)" },
      { combo: "e", label: "Escalate to L2" },
      { combo: "o", label: "Choose an override reason" },
      { combo: "a", label: "Assign to me" },
      { combo: "n", label: "Write a note" },
      { combo: "j", label: "Next alert in the queue" },
      { combo: "k", label: "Previous alert" },
    ],
  },
  {
    title: "Anywhere",
    keys: [
      { combo: "g q", label: "Go to the queue" },
      { combo: "?", label: "Show this list" },
    ],
  },
];

function DemoWorkspace() {
  const { toast } = useToast();
  const [state, setState] = useState<State | null>(null);
  const [view, setView] = useState<View>({ name: "queue", filter: "open" });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [rateSec, setRateSec] = useState(20);
  const [arrived, setArrived] = useState(0);
  const [rerunning, setRerunning] = useState(false);
  const [tourOpen, setTourOpen] = useTourAutostart(DEMO_TOUR_STORAGE_KEY, !!state);
  const ref = useRef<State | null>(null);
  const auditChain = useRef<Promise<void>>(Promise.resolve());
  const head = useRef({ hash: "0".repeat(64), seq: 0 });
  const feed = useRef<LiveFeed | null>(null);
  const modelConfig = useModelConfig();

  const commit = useCallback((fn: (s: State) => State) => {
    setState((prev) => {
      const next = fn(prev!);
      ref.current = next;
      return next;
    });
  }, []);

  const audit = useCallback(
    (e: { actorType: string; actorName: string; action: string; entityId: string; detail: string; entityType?: string; ts?: Date }) => {
      auditChain.current = auditChain.current.then(async () => {
        // The chain head lives in a ref so appends never read state React has not applied yet.
        const prevHash = head.current.hash;
        const seq = head.current.seq + 1;
        const ts = e.ts ?? new Date();
        const ev = { actorType: e.actorType, actorName: e.actorName, action: e.action, entityType: e.entityType ?? "alert", entityId: e.entityId, detail: e.detail, ts };
        const hash = await sha256(prevHash + auditBody(ev));
        head.current = { hash, seq };
        commit((s) => ({ ...s, audit: [...s.audit, { ...ev, seq, prevHash, hash }] }));
      });
      return auditChain.current;
    },
    [commit],
  );

  const triage = useCallback(async (s: Scenario, id: string, settings: PolicySettings, watchlist: State["watchlist"], useKey = false): Promise<Run> => {
    const provider = useKey && modelConfig ? createBrowserProvider(modelConfig) : new SimulatedProvider();
    const result = await runTriage(scenarioToBundle(s, watchlist, id), useKey && modelConfig ? { ...settings, provider: modelConfig.provider } : settings, provider);
    return { ...result, id: newId("RUN"), startedAt: new Date(), policyVersion: settings.version };
  }, [modelConfig]);

  /* ---------------- build or restore the workspace ---------------- */
  const build = useCallback(async () => {
    const seed = Math.floor(Math.random() * 1e9);
    const now = new Date();
    const rng = prng(seed ^ 0x5eed);
    const { open, recentlyClosed, watchlist } = buildScenarios(prng(seed), now);
    const settings = DEFAULT_POLICY;
    const provider = new SimulatedProvider();
    const alerts: DemoAlert[] = [];
    const qa: State["qa"] = [];
    const owners = [ME.id, "u-jordan", "u-priya", null, null];
    for (const [i, s] of [...recentlyClosed, ...open].entries()) {
      const id = newId("ALT");
      const result = await runTriage(scenarioToBundle(s, watchlist, id), settings, provider);
      const run: Run = { ...result, id: newId("RUN"), startedAt: new Date(s.alert.createdAt.getTime() + 120_000), policyVersion: settings.version };
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
        decisions: closed ? [{ id: newId("DEC"), actorType: "human", actorName: "Jordan Lee", action: "batch_close", reasonCode: null, note: null, createdAt: new Date(s.alert.createdAt.getTime() + 20 * HOUR) }] : [],
        assigneeId: closed ? "u-jordan" : owners[rng.int(0, owners.length - 1)],
        notes: [],
        source: "seed",
      });
      if (closed) qa.push({ id: newId("QA"), alertId: id, typology: s.alert.typology, sampledAt: new Date(s.alert.createdAt.getTime() + 21 * HOUR), result: null, note: null, reviewedAt: null });
    }
    const initial: State = { seed, createdAt: now, settings, watchlist, alerts, qa, audit: [] };
    head.current = { hash: "0".repeat(64), seq: 0 };
    auditChain.current = Promise.resolve();
    ref.current = initial;
    setState(initial);
    const ordered = [...alerts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const a of ordered) {
      const r = latest(a);
      await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityId: a.id, detail: `${r.recommendation}, ${r.model}, policy v${settings.version}`, ts: r.startedAt });
    }
  }, [audit]);

  useEffect(() => {
    const saved = loadDemoState<State>(STORAGE_KEY);
    if (saved && looksLikeState(saved)) {
      (async () => {
        const chain = await verifyChain(saved.audit);
        const last = saved.audit[saved.audit.length - 1];
        head.current = last ? { hash: last.hash, seq: last.seq } : { hash: "0".repeat(64), seq: 0 };
        ref.current = saved;
        setState(saved);
        setSavedAt(new Date());
        if (!chain.ok) toast({ title: "Saved audit log does not verify", body: `The chain breaks at event ${chain.brokenAt}. Reset the demo to start a clean workspace.`, tone: "warn" });
        else toast({ title: "Welcome back", body: "Your demo workspace was restored from this browser.", tone: "info", durationMs: 4000 });
      })();
    } else {
      void Promise.resolve().then(build);
      track("demo_start");
    }
  }, [build, toast]);

  // Save after changes settle.
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      if (saveDemoState(STORAGE_KEY, state)) setSavedAt(new Date());
    }, 600);
    return () => clearTimeout(t);
  }, [state]);

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
    if (override && !reasonCode) return { error: "Choose a reason code to override the agent's recommendation. Press O to jump to it." };
    const action: DecisionAction = outcome === "close" ? (agrees ? "accept_close" : "override_to_close") : agrees ? "accept_escalate" : "override_to_escalate";
    update(a.id, (x) => ({
      ...x,
      status: outcome === "close" ? "closed" : "escalated",
      assigneeId: x.assigneeId ?? ME.id,
      decisions: [...x.decisions, { id: newId("DEC"), actorType: "human", actorName: ME.name, action, reasonCode, note: str(fd, "note") || null, createdAt: new Date() }],
    }));
    if (outcome === "close" && r.recommendation === "close" && Math.random() < ref.current!.settings.qaSampleRate) {
      commit((s) => ({ ...s, qa: [...s.qa, { id: newId("QA"), alertId: a.id, typology: a.s.alert.typology, sampledAt: new Date(), result: null, note: null, reviewedAt: null }] }));
    }
    await audit({ actorType: "human", actorName: ME.name, action: `l1.${action}`, entityId: a.id, detail: reasonCode ? `reason: ${reasonCode}` : `agent said ${r.recommendation}` });
    track("demo_action", { label: action });
    return { ok: outcome === "close" ? `${a.id} closed.` : `${a.id} escalated to L2. It is in L2 investigations with the draft narrative.` };
  };

  const batch = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const ids = fd.getAll("alertId").map(String);
    const eligible = ids.map(find).filter((a) => a.status === "triaged" && latest(a).batchEligible);
    if (!eligible.length) return { error: "None of the selected alerts are eligible for batch approval." };
    const rate = ref.current!.settings.qaSampleRate;
    const n = Math.max(1, Math.ceil(eligible.length * rate));
    const sampled = new Set([...eligible].sort(() => Math.random() - 0.5).slice(0, n).map((a) => a.id));
    const now = new Date();
    commit((s) => ({
      ...s,
      alerts: s.alerts.map((a) => (eligible.some((e) => e.id === a.id) ? { ...a, status: "closed", decisions: [...a.decisions, { id: newId("DEC"), actorType: "human", actorName: ME.name, action: "batch_close", reasonCode: null, note: null, createdAt: now }] } : a)),
      qa: [...s.qa, ...eligible.filter((a) => sampled.has(a.id)).map((a) => ({ id: newId("QA"), alertId: a.id, typology: a.s.alert.typology, sampledAt: now, result: null, note: null, reviewedAt: null }))],
    }));
    await audit({ actorType: "human", actorName: ME.name, action: "l1.batch_close", entityType: "batch", entityId: `${eligible.length} alerts`, detail: `${sampled.size} sampled for QA` });
    return { ok: `Closed ${eligible.length} alerts. ${sampled.size} sampled for QA.` };
  };

  const markSuspicious = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    if (a.status !== "escalated") return { error: "Only escalated alerts can be marked suspicious." };
    const now = new Date();
    const due = new Date(now.getTime() + (fd.get("noSuspect") === "on" ? 60 : 30) * DAY);
    update(a.id, (x) => ({ ...x, suspicionDeterminedAt: now, sarDueAt: due }));
    await audit({ actorType: "human", actorName: ME.name, action: "l2.suspicion_determined", entityId: a.id, detail: `SAR due ${due.toISOString().slice(0, 10)}` });
    return { ok: `SAR clock started. Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.` };
  };

  const sarDecision = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const file = str(fd, "decision") === "file";
    if (a.status !== "escalated") return { error: "Only escalated alerts can receive a SAR decision." };
    if (file && !a.suspicionDeterminedAt) return { error: "Mark the activity suspicious before recording a SAR filing." };
    update(a.id, (x) => ({ ...x, status: file ? "sar_filed" : "no_sar", decisions: [...x.decisions, { id: newId("DEC"), actorType: "human", actorName: ME.name, action: file ? "sar_file" : "sar_no_file", reasonCode: null, note: str(fd, "note") || null, createdAt: new Date() }] }));
    await audit({ actorType: "human", actorName: ME.name, action: file ? "l2.sar_filed" : "l2.closed_no_sar", entityId: a.id, detail: str(fd, "note") });
    return { ok: file ? "SAR filing recorded." : "Closed with no SAR." };
  };

  const rerun = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const useKey = !!modelConfig;
    try {
      const run = await triage(a.s, a.id, ref.current!.settings, ref.current!.watchlist, useKey);
      update(a.id, (x) => ({ ...x, runs: [run, ...x.runs], status: run.outcome === "locked" ? "locked" : isOpen(x.status) ? "triaged" : x.status }));
      await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityId: a.id, detail: `re-run on ${run.model}: ${run.recommendation}` });
      if (run.outcome === "error") return { error: `The model call failed: ${run.error ?? "unknown error"}. The alert stays with a human.` };
      return { ok: `Re-run on ${run.model}: ${run.recommendation.replace("_", " ")}${run.costEstimated ? "" : `, cost $${(run.costMicros / 1e6).toFixed(4)}`}.` };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Re-run failed." };
    }
  };

  const assign = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const to = str(fd, "assigneeId") || null;
    const member = TEAM.find((m) => m.id === to);
    if (to && !member) return { error: "That person is not in this workspace." };
    update(a.id, (x) => ({ ...x, assigneeId: to }));
    await audit({ actorType: "human", actorName: ME.name, action: "alert.assigned", entityId: a.id, detail: member ? `to ${member.name}` : "unassigned" });
    return { ok: member ? `${a.id} assigned to ${member.id === ME.id ? "you" : member.name}.` : `${a.id} is unassigned.` };
  };

  const addNote = async (_: ActionState, fd: FormData): Promise<ActionState> => {
    const a = find(str(fd, "alertId"));
    const body = str(fd, "body");
    if (!body) return { error: "Write something first." };
    if (body.length > 4000) return { error: "Notes are limited to 4,000 characters." };
    const kind = str(fd, "kind") === "handoff" ? "handoff" : "note";
    const lower = body.toLowerCase();
    const mentions = TEAM.filter((m) => lower.includes(`@${m.name.split(" ")[0].toLowerCase()}`) || lower.includes(`@${m.name.toLowerCase().replace(/\s+/g, "")}`)).map((m) => m.id);
    update(a.id, (x) => ({ ...x, notes: [...x.notes, { id: newId("NOTE"), authorId: ME.id, authorName: ME.name, body, mentions, kind, createdAt: new Date() }] }));
    await audit({ actorType: "human", actorName: ME.name, action: kind === "handoff" ? "alert.handoff" : "alert.note", entityId: a.id, detail: mentions.length ? `mentioned ${mentions.map((id) => TEAM.find((m) => m.id === id)!.name).join(", ")}` : "note added" });
    return { ok: kind === "handoff" ? "Handoff note added for L2." : mentions.length ? `Note added. ${mentions.length} teammate(s) notified.` : "Note added." };
  };

  const reviewQa = async (id: string, result: "agree" | "disagree", note: string) => {
    commit((s) => ({ ...s, qa: s.qa.map((q) => (q.id === id ? { ...q, result, note, reviewedAt: new Date() } : q)) }));
    const q = ref.current!.qa.find((x) => x.id === id)!;
    await audit({ actorType: "human", actorName: ME.name, action: `qa.${result}`, entityId: q.alertId, detail: note });
    toast({ title: result === "agree" ? "QA: agreed" : "QA: disagreement logged", body: q.alertId, tone: result === "agree" ? "ok" : "warn", durationMs: 3000 });
  };

  const importScenarios = async (scenarios: Scenario[]) => {
    const s0 = ref.current!;
    const added: DemoAlert[] = [];
    for (const s of scenarios) {
      const id = newId("ALT");
      const run = await triage(s, id, s0.settings, s0.watchlist);
      added.push({ id, s, status: run.outcome === "locked" ? "locked" : "triaged", createdAt: s.alert.createdAt, slaDueAt: new Date(s.alert.createdAt.getTime() + s0.settings.internalSlaDays * DAY), suspicionDeterminedAt: null, sarDueAt: null, runs: [run], decisions: [], assigneeId: null, notes: [], source: "csv" });
    }
    commit((s) => ({ ...s, alerts: [...added, ...s.alerts] }));
    await audit({ actorType: "human", actorName: ME.name, action: "import.csv", entityType: "import", entityId: `${added.length} alerts`, detail: "uploaded in the browser" });
    for (const a of added) await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityId: a.id, detail: `${latest(a).recommendation}, ${latest(a).model}` });
    setImportOpen(false);
    toast({ title: `Imported ${added.length} alert${added.length === 1 ? "" : "s"}`, body: "Triaged by the agent and added to the open queue.", tone: "ok", action: added[0] ? { label: "Open first", onClick: () => go({ name: "alert", id: added[0].id }) } : undefined });
  };

  const savePolicy = async (next: PolicySettings, rerunOpen: boolean) => {
    const prev = ref.current!.settings;
    const settings = { ...next, version: prev.version + 1 };
    commit((s) => ({ ...s, settings }));
    await audit({ actorType: "human", actorName: ME.name, action: "policy.updated", entityType: "policy", entityId: `v${settings.version}`, detail: `from v${prev.version}` });
    if (!rerunOpen) {
      toast({ title: `Policy v${settings.version} saved`, body: "New runs use it. Re-run open alerts to apply it to the queue.", tone: "ok" });
      return;
    }
    setRerunning(true);
    const s0 = ref.current!;
    let changed = 0;
    const open = s0.alerts.filter((a) => isOpen(a.status));
    const runs = new Map<string, Run>();
    for (const a of open) {
      const run = await triage(a.s, a.id, settings, s0.watchlist);
      if (run.recommendation !== latest(a).recommendation || run.batchEligible !== latest(a).batchEligible) changed++;
      runs.set(a.id, run);
    }
    commit((s) => ({ ...s, alerts: s.alerts.map((a) => (runs.has(a.id) ? { ...a, runs: [runs.get(a.id)!, ...a.runs], status: runs.get(a.id)!.outcome === "locked" ? "locked" : "triaged" } : a)) }));
    await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityType: "batch", entityId: `${open.length} alerts`, detail: `re-run under policy v${settings.version}, ${changed} changed` });
    setRerunning(false);
    toast({ title: `Re-ran ${open.length} open alerts under policy v${settings.version}`, body: `${changed} changed recommendation or batch eligibility.`, tone: "ok", action: { label: "See the queue", onClick: () => go({ name: "queue", filter: "open" }) } });
  };

  const reset = () => {
    clearDemoState(STORAGE_KEY);
    resetTour(DEMO_TOUR_STORAGE_KEY);
    setLive(false);
    setArrived(0);
    feed.current = null;
    setState(null);
    ref.current = null;
    setView({ name: "queue", filter: "open" });
    void build();
    toast({ title: "Fresh workspace", body: "New synthetic alerts, a new audit chain, default policy.", tone: "info" });
  };

  /* ---------------- live queue ---------------- */
  const go = useCallback((v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!live || !state) return;
    const tick = async () => {
      const s0 = ref.current!;
      if (!feed.current) feed.current = createLiveFeed(s0.seed, { avoidNames: s0.alerts.map((a) => a.s.customer.name) });
      const sc = feed.current.next(new Date());
      const id = newId("ALT");
      const run = await triage(sc, id, s0.settings, s0.watchlist);
      const a: DemoAlert = { id, s: sc, status: run.outcome === "locked" ? "locked" : "triaged", createdAt: sc.alert.createdAt, slaDueAt: new Date(sc.alert.createdAt.getTime() + s0.settings.internalSlaDays * DAY), suspicionDeterminedAt: null, sarDueAt: null, runs: [run], decisions: [], assigneeId: null, notes: [], source: "live" };
      commit((s) => ({ ...s, alerts: [a, ...s.alerts] }));
      await audit({ actorType: "system", actorName: "monitoring-feed", action: "alert.received", entityId: id, detail: `${sc.alert.ruleCode}, ${TYPOLOGY_LABEL[sc.alert.typology]}` });
      await audit({ actorType: "agent", actorName: AGENT, action: "agent.triage_completed", entityId: id, detail: `${run.recommendation}, ${run.model}` });
      setArrived((n) => n + 1);
      toast({ title: `New alert: ${sc.customer.name}`, body: `${TYPOLOGY_LABEL[sc.alert.typology]}. Agent recommends ${run.recommendation.replace("_", " ")} (risk ${run.riskScore}).`, tone: run.recommendation === "escalate" ? "warn" : "info", action: { label: "Open", onClick: () => go({ name: "alert", id }) } });
    };
    const t = setInterval(() => void tick(), rateSec * 1000);
    return () => clearInterval(t);
  }, [live, rateSec, state == null, audit, commit, go, toast, triage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- global shortcuts ---------------- */
  useHotkeys({
    "?": () => setHelpOpen(true),
    "g q": () => go({ name: "queue", filter: "open" }),
  });

  const openOrder = useMemo(
    () =>
      state
        ? state.alerts
            .filter((a) => isOpen(a.status))
            .sort((x, y) => latest(y).riskScore - latest(x).riskScore)
            .map((a) => a.id)
        : [],
    [state],
  );
  const rollups = useMemo(() => (state ? syntheticRollups(prng(state.seed), new Date(state.createdAt)) : []), [state?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const exports = (s: State) => {
    const events = s.audit.map((e) => ({ ...e, payload: e.detail ? { detail: e.detail } : {} }));
    const stamp = new Date().toISOString().slice(0, 10);
    return [
      { label: "Audit log (CSV)", hint: `${s.audit.length} events`, onSelect: () => downloadText(`assay-audit-${stamp}.csv`, auditToCsv(events), "text/csv") },
      {
        label: "Audit log (JSON, verifiable)",
        hint: "Includes every hash",
        onSelect: async () => {
          const chain = await verifyChain(s.audit);
          downloadText(`assay-audit-${stamp}.json`, auditToJson(events, { workspaceName: WORKSPACE, chain: { ok: chain.ok, events: s.audit.length, brokenAtSeq: chain.brokenAt, headHash: chain.head } }), "application/json");
        },
      },
      {
        label: "Decisions (CSV)",
        onSelect: () =>
          downloadText(
            `assay-decisions-${stamp}.csv`,
            decisionsToCsv(
              s.alerts.flatMap((a) =>
                a.decisions.map((d) => ({ ...d, alertId: a.id, typology: a.s.alert.typology, runId: latest(a).id, agreedWithAgent: d.action.startsWith("accept") ? true : d.action.startsWith("override") ? false : null })),
              ),
            ),
            "text/csv",
          ),
      },
      {
        label: "QA report (CSV)",
        hint: `${s.qa.length} sampled`,
        onSelect: () =>
          downloadText(
            `assay-qa-${stamp}.csv`,
            qaToCsv(
              s.qa.map((q) => {
                const a = s.alerts.find((x) => x.id === q.alertId);
                return { ...q, reviewer: q.result ? ME.name : null, agentRecommendation: a ? latest(a).recommendation : null, humanDecision: a?.decisions.at(-1)?.action ?? null };
              }),
            ),
            "text/csv",
          ),
      },
      { label: "Model risk documentation", hint: "Printable, save as PDF", onSelect: () => openModelRiskPack(s, rollups) },
    ];
  };

  if (!state) {
    return (
      <div className="empty" style={{ maxWidth: 520, margin: "20vh auto" }} role="status">
        <h2>Setting up your demo workspace</h2>
        <p>Generating synthetic alerts and running the triage agent on each one, in your browser.</p>
      </div>
    );
  }

  const open = state.alerts.filter((a) => isOpen(a.status));
  const l2 = state.alerts.filter((a) => a.status === "escalated");
  const qaPending = state.qa.filter((q) => !q.result);
  const NAV: { label: string; v: View; count?: number }[] = [
    { label: "Alert queue", v: { name: "queue", filter: "open" }, count: open.length },
    { label: "L2 investigations", v: { name: "l2" }, count: l2.length },
    { label: "QA review", v: { name: "qa" }, count: qaPending.length },
    { label: "Team", v: { name: "team" } },
    { label: "Shadow mode", v: { name: "shadow" } },
    { label: "Policy", v: { name: "policy" } },
    { label: "Metrics", v: { name: "metrics" } },
    { label: "Audit log", v: { name: "audit" } },
  ];
  const current = (v: View) => v.name === view.name || (v.name === "queue" && (view.name === "alert" || view.name === "customer"));
  const shadow = Object.fromEntries(TYPOLOGIES.map((t) => [t, state.settings.autonomy[t] === 0])) as Record<Typology, boolean>;

  return (
    <div className="app">
      <aside className="app-side">
        <a href="../" className="app-side__brand" aria-label="Assay home">
          <Wordmark size={19} />
        </a>
        <div className="app-side__ws">
          <strong>{WORKSPACE}</strong>
          <span>Demo workspace, policy v{state.settings.version}</span>
        </div>
        <nav className="app-nav" aria-label="Workbench">
          {NAV.map((n) => (
            <a key={n.label} href="#" aria-current={current(n.v) ? "page" : undefined} onClick={(e) => (e.preventDefault(), go(n.v))}>
              {n.label}
              {n.count ? (
                <span className="count" aria-label={`${n.count} items`}>
                  {n.count}
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="app-side__foot">
          <span>Signed in as {ME.name}</span>
          <button type="button" className="linklike" onClick={() => setHelpOpen(true)}>
            Keyboard shortcuts (?)
          </button>
          <button type="button" className="linklike" onClick={() => (resetTour(DEMO_TOUR_STORAGE_KEY), go({ name: "queue", filter: "open" }), setTourOpen(true))}>
            Take the tour
          </button>
          <a href="../">Back to the website</a>
        </div>
      </aside>
      <div className="app-main">
        <div className="demo-bar">
          <span>Synthetic data, real engine. Your work is saved in this browser.</span>
          <div className="demo-bar__tools">
            <LiveFeedControl running={live} onToggle={() => setLive((v) => !v)} rateSec={rateSec} onRate={setRateSec} arrived={arrived} />
            <SavedIndicator savedAt={savedAt} />
            <ResetDemoButton onReset={reset} />
          </div>
        </div>
        <div className="app-content">
          {view.name === "queue" && (
            <>
              <div className="app-head">
                <div>
                  <h1>Alert queue</h1>
                  <p>Sorted by agent risk score. Press J and K to move, Enter to open, / to search.</p>
                </div>
                <div className="app-tools">
                  <button type="button" className="btn btn-outline btn-small" onClick={() => setImportOpen(true)}>
                    Import CSV
                  </button>
                  <ExportMenu items={exports(state)} />
                </div>
              </div>
              <QueueSummary state={state} />
              <div className="filters">
                {(["open", "closed", "escalated"] as const).map((f) => (
                  <a key={f} href="#" aria-current={view.filter === f ? "true" : undefined} onClick={(e) => (e.preventDefault(), go({ name: "queue", filter: f }))}>
                    {f[0].toUpperCase() + f.slice(1)}
                  </a>
                ))}
              </div>
              <QueueTable
                key={view.filter}
                rows={queueRows(state, view.filter)}
                shadow={shadow}
                batchableCount={view.filter === "open" ? open.filter((a) => a.status === "triaged" && latest(a).batchEligible && !shadow[a.s.alert.typology]).length : 0}
                qaRate={state.settings.qaSampleRate}
                selectable={view.filter === "open"}
                batchAction={batch}
                alertHref={(id) => `#${id}`}
                onOpen={(id) => go({ name: "alert", id })}
                members={TEAM}
                currentUserId={ME.id}
                storageKey="assay.demo.views"
              />
            </>
          )}
          {view.name === "alert" && (
            <AlertView
              key={view.id + (state.alerts.find((a) => a.id === view.id)?.runs.length ?? 0)}
              state={state}
              id={view.id}
              order={openOrder}
              go={go}
              actions={{ decide, markSuspicious, sarDecision, rerun, assign, addNote }}
              exportItems={exports(state)}
              onModelSaved={() => {
                const fd = new FormData();
                fd.set("alertId", view.id);
                void rerun({}, fd).then((r) => toast({ title: r.ok ? "Re-ran on your model" : "Live model failed", body: r.ok ?? r.error, tone: r.ok ? "ok" : "error" }));
              }}
            />
          )}
          {view.name === "customer" && <CustomerView state={state} customerId={view.id} back={() => (view.from ? go({ name: "alert", id: view.from }) : go({ name: "queue", filter: "open" }))} open={(id) => go({ name: "alert", id })} />}
          {view.name === "l2" && <L2View alerts={l2} open={(id) => go({ name: "alert", id })} />}
          {view.name === "qa" && <QaView state={state} review={reviewQa} open={(id) => go({ name: "alert", id })} />}
          {view.name === "team" && <TeamView state={state} openQueue={() => go({ name: "queue", filter: "open" })} />}
          {view.name === "shadow" && <ShadowModeView seed={state.seed} />}
          {view.name === "policy" && <PolicyView key={state.settings.version} settings={state.settings} rerunning={rerunning} onSave={savePolicy} />}
          {view.name === "metrics" && <MetricsView rollups={rollups} state={state} exportPack={() => openModelRiskPack(state, rollups)} />}
          {view.name === "audit" && <AuditView audit={state.audit} exportItems={exports(state).slice(0, 2)} />}
        </div>
      </div>
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import alerts from CSV" description="Same column template as the server API. The file never leaves your browser.">
        <ImportPanel onImport={(s) => void importScenarios(s)} onClose={() => setImportOpen(false)} />
      </Modal>
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} groups={SHORTCUT_GROUPS} />
      <GuidedTour
        steps={DEMO_TOUR_STEPS}
        open={tourOpen}
        storageKey={DEMO_TOUR_STORAGE_KEY}
        onClose={() => setTourOpen(false)}
        onStepChange={(i) => {
          if (i === 0) go({ name: "queue", filter: "open" });
          else if (i >= 1 && i <= 3 && view.name !== "alert") {
            const first = openOrder.find((id) => latest(state.alerts.find((a) => a.id === id)!).recommendation === "escalate") ?? openOrder[0];
            if (first) setView({ name: "alert", id: first });
          } else if (i === 4) setView({ name: "audit" });
        }}
      />
    </div>
  );
}

function QueueSummary({ state }: { state: State }) {
  const openList = state.alerts.filter((a) => isOpen(a.status));
  const count = (rec: string) => openList.filter((a) => latest(a).recommendation === rec).length;
  return (
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
      <div className="summary__item">
        <b>{openList.filter((a) => a.assigneeId === ME.id).length}</b>
        <span>assigned to you</span>
      </div>
    </div>
  );
}

function queueRows(state: State, filter: "open" | "closed" | "escalated") {
  const statuses: Record<string, string[]> = { open: ["new", "triaged", "locked"], closed: ["closed", "no_sar"], escalated: ["escalated", "sar_filed"] };
  return state.alerts
    .filter((a) => statuses[filter].includes(a.status))
    .sort((x, y) => latest(y).riskScore - latest(x).riskScore)
    .map((a) => {
      const r = latest(a);
      return {
        id: a.id,
        ruleCode: a.s.alert.ruleCode,
        ruleDescription: a.s.alert.ruleDescription,
        typology: a.s.alert.typology,
        status: a.status,
        createdAt: new Date(a.createdAt).toISOString(),
        slaDueAt: new Date(a.slaDueAt).toISOString(),
        sarDueAt: a.sarDueAt ? new Date(a.sarDueAt).toISOString() : null,
        customerId: a.s.customer.id,
        customerName: a.s.customer.name,
        customerKind: a.s.customer.kind,
        recommendation: r.recommendation,
        modelRecommendation: r.modelRecommendation,
        confidence: r.confidence,
        riskScore: r.riskScore,
        batchEligible: r.batchEligible,
        outcome: r.outcome,
        assigneeId: a.assigneeId,
        assigneeName: TEAM.find((m) => m.id === a.assigneeId)?.name ?? null,
      };
    });
}

function openModelRiskPack(s: State, rollups: ReturnType<typeof syntheticRollups>) {
  const runs = s.alerts.map(latest);
  const completed = runs.filter((r) => r.outcome === "completed");
  const types = aggregateTypologies(rollups);
  const html = buildModelRiskPack({
    workspaceName: WORKSPACE,
    generatedAt: new Date().toISOString(),
    policy: { ...s.settings, autonomy: { ...s.settings.autonomy } },
    model: { provider: runs[0]?.provider ?? "simulated", model: runs[0]?.model ?? "assay-rules-v1", promptVersion: PROMPT_VERSION },
    runStats: {
      runs: runs.length,
      completed: completed.length,
      locked: runs.filter((r) => r.outcome === "locked").length,
      abstained: runs.filter((r) => r.outcome === "abstained").length,
      citationValidRate: completed.length ? completed.filter((r) => r.validation.valid).length / completed.length : null,
      avgCostUsd: runs.reduce((x, r) => x + r.costMicros, 0) / Math.max(1, runs.length) / 1e6,
    },
    typologyStats: types.map((t) => ({ typology: t.typology, alerts: t.alerts, qaSampled: t.qaSampled, qaAgreement: t.qaAgreement, shadowAgreement: t.shadowAgreement })),
  });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) downloadText("assay-model-risk-pack.html", html, "text/html");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function AlertView({
  state,
  id,
  order,
  go,
  actions,
  exportItems,
  onModelSaved,
}: {
  state: State;
  id: string;
  order: string[];
  go: (v: View) => void;
  actions: Record<"decide" | "markSuspicious" | "sarDecision" | "rerun" | "assign" | "addNote", (p: ActionState, f: FormData) => Promise<ActionState>>;
  exportItems: { label: string; hint?: string; onSelect: () => void | Promise<void> }[];
  onModelSaved: () => void;
}) {
  const a = state.alerts.find((x) => x.id === id);
  if (!a) {
    return (
      <div className="panel empty">
        <h2>Alert not found</h2>
        <p>It may have been removed when the demo was reset.</p>
      </div>
    );
  }
  const settings = state.settings;
  const bundle = scenarioToBundle(a.s, state.watchlist, a.id);
  const findings = computeFindings(bundle, settings);
  const run = latest(a);
  const cited = new Set(run.rationale.flatMap((r) => r.citations));
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  const idx = order.indexOf(a.id);
  // After a decision this alert leaves the open list; keep the neighbours it had.
  const nextId = idx >= 0 ? order[idx + 1] : order[0];
  const prevId = idx > 0 ? order[idx - 1] : null;
  const shadow = isOpen(a.status) && settings.autonomy[a.s.alert.typology] === 0;
  return (
    <>
      <p style={{ marginBottom: 10, fontSize: 13.5 }}>
        <a href="#" onClick={(e) => (e.preventDefault(), go({ name: "queue", filter: "open" }))}>
          Alert queue
        </a>
      </p>
      <AlertWorkspace
        actions={actions}
        alert={{ id: a.id, externalId: a.source === "csv" ? a.s.key : null, ruleCode: a.s.alert.ruleCode, ruleDescription: a.s.alert.ruleDescription, typology: a.s.alert.typology, status: a.status, createdAt: iso(a.createdAt)!, slaDueAt: iso(a.slaDueAt)!, suspicionDeterminedAt: iso(a.suspicionDeterminedAt), sarDueAt: iso(a.sarDueAt), triggeredTxnIds: a.s.alert.triggeredTxnIds, source: a.source }}
        customer={{ ...bundle.customer, onboardedAt: iso(bundle.customer.onboardedAt) }}
        transactions={[...bundle.transactions].reverse().map((t) => ({ ...t, ts: iso(t.ts)! }))}
        historyCited={bundle.history.filter((h) => cited.has(h.id)).map((t) => ({ ...t, ts: iso(t.ts)! }))}
        historyCount={bundle.history.length}
        priorCases={bundle.priorCases.map((c) => ({ ...c, openedAt: iso(c.openedAt)! }))}
        watchlistHits={findings.watchlistHits}
        injectionTxnIds={findings.injection.map((h) => h.txnId)}
        run={{
          id: run.id,
          startedAt: iso(run.startedAt)!,
          finishedAt: iso(run.startedAt)!,
          agentIdentity: AGENT,
          provider: run.provider,
          model: run.model,
          policyVersion: run.policyVersion ?? settings.version,
          promptVersion: PROMPT_VERSION,
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
        runHistory={a.runs.map((r) => ({ id: r.id, at: iso(r.startedAt)!, model: r.model, policyVersion: r.policyVersion ?? settings.version, recommendation: r.recommendation }))}
        decisions={a.decisions.map((d) => ({ ...d, createdAt: iso(d.createdAt)! }))}
        shadow={shadow}
        reasons={OVERRIDE_REASONS.map((r) => ({ ...r }))}
        demo
        collab={{ members: TEAM, assigneeId: a.assigneeId, currentUserId: ME.id, notes: a.notes.map((n) => ({ ...n, createdAt: iso(n.createdAt)! })) }}
        ask={{ bundle, findings, result: run }}
        highRiskCountries={DEFAULT_HIGH_RISK_COUNTRIES}
        onOpenCustomer={() => go({ name: "customer", id: a.s.customer.id, from: a.id })}
        nav={{
          next: nextId && nextId !== a.id ? () => go({ name: "alert", id: nextId }) : null,
          prev: prevId ? () => go({ name: "alert", id: prevId }) : null,
          position: idx >= 0 ? `${idx + 1} of ${order.length}` : undefined,
        }}
        onModelSaved={onModelSaved}
        headerExtra={<ExportMenu label="Export" items={exportItems} />}
      />
    </>
  );
}

export type { Audit };
