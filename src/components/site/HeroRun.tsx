"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { LogoMark } from "@/components/Wordmark";
import { Icon, TYPOLOGY_ICON, type IconName } from "@/components/viz/Icon";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { fmtMs } from "@/lib/util";
import type { HeroCase, HeroData } from "./hero-run-data";
import "./hero-run.css";

/*
 * The home page workbench replay. The first frame is server-rendered from a
 * real engine run (see hero-run-data.ts). On the client the engine runs again in
 * the browser, then the trace streams step by step and each cited claim lights
 * up the records it points to. Reduced motion gets the finished frame, still
 * clickable. Playback pauses off screen, in a background tab, on hover or focus
 * of a claim, and with the pause button.
 */

type Ev = { kind: "select" } | { kind: "step"; i: number; done: boolean } | { kind: "rec" } | { kind: "claim"; k: number } | { kind: "hold" };

const STEP_ICON: Record<string, IconName> = {
  read_alert: "file",
  read_kyc: "user",
  read_transactions: "database",
  read_prior_cases: "review",
  screen_watchlist: "watchlist",
  scan_untrusted_text: "eye",
  detect_patterns: "chart",
  policy_pre: "shield",
  model_assess: "spark",
  validate_citations: "check",
  policy_post: "shield",
};

function timeline(c: HeroCase): { ev: Ev; ms: number }[] {
  const out: { ev: Ev; ms: number }[] = [{ ev: { kind: "select" }, ms: 900 }];
  c.steps.forEach((s, i) => {
    const model = s.tool === "model_assess" && s.label !== "Model not called";
    const slow = s.tool === "detect_patterns" || s.tool === "validate_citations";
    out.push({ ev: { kind: "step", i, done: false }, ms: model ? 1300 : slow ? 420 : 240 });
    out.push({ ev: { kind: "step", i, done: true }, ms: s.flag ? 1100 : model || slow ? 800 : 420 });
  });
  out.push({ ev: { kind: "rec" }, ms: 1100 });
  c.claims.forEach((_, k) => out.push({ ev: { kind: "claim", k }, ms: 1900 }));
  out.push({ ev: { kind: "hold" }, ms: 6000 });
  return out;
}

function markFor(c: HeroCase): { cls: string; title: string; note: string } {
  const pct = `${Math.round(c.confidence * 100)}% confidence, risk score ${c.riskScore}`;
  if (c.recommendation === "escalate") return { cls: "mark-escalate", title: "Escalate to L2", note: pct };
  if (c.recommendation === "close") return { cls: "mark-close", title: "Close", note: pct };
  if (c.outcome === "locked") return { cls: "mark-review", title: "Human review", note: "Locked by policy P1, model not called" };
  if (c.outcome === "abstained") return { cls: "mark-review", title: "Human review", note: "Agent abstained under policy P3" };
  return { cls: "mark-review", title: "Human review", note: pct };
}

function recLine(c: HeroCase): string {
  if (c.outcome === "locked") return "The memo reads like an order to the agent. The alert goes to an analyst and the text never reaches a model.";
  if (c.recommendation === "close" && c.batchEligible) return `${c.claims.length} claims, every citation resolved. Eligible for batch approval, with a QA sample drawn from the batch.`;
  if (c.recommendation === "escalate") return `${c.claims.length} claims, every citation resolved. Draft L2 narrative attached. An analyst decides.`;
  return `${c.claims.length} claims. An analyst decides.`;
}

function Chips({ ids, pulse, visible }: { ids: string[]; pulse: boolean; visible: Set<string> }) {
  const shown = [ids.find((id) => visible.has(id)) ?? ids[0]].filter(Boolean);
  return (
    <span className="hrun__chips">
      {shown.map((id) => (
        <span key={id} className={`stamp${pulse ? " hrun__pulse" : ""}`}>
          <span>{id}</span>
        </span>
      ))}
      {ids.length > 1 && (
        <span className="stamp stamp-muted">
          <span>+{ids.length - 1}</span>
        </span>
      )}
    </span>
  );
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}
const reducedNow = () => window.matchMedia(REDUCED_QUERY).matches;
function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const hiddenNow = () => document.visibilityState === "hidden";
const serverFalse = () => false;

export function HeroRun({ data: initial }: { data: HeroData }) {
  const [data, setData] = useState(initial);
  const timelines = useMemo(() => data.cases.map(timeline), [data]);
  const loop = data.loop.length ? data.loop : [0];
  const [pos, setPos] = useState(() => ({ run: loop[0], ev: timelines[loop[0]].length - 1 }));
  const [live, setLive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [pinned, setPinned] = useState<number | null>(null);
  const reduced = useSyncExternalStore(subscribeReduced, reducedNow, serverFalse);
  const pageHidden = useSyncExternalStore(subscribeVisibility, hiddenNow, serverFalse);
  const rootRef = useRef<HTMLElement>(null);
  const claimsRef = useRef<HTMLOListElement>(null);
  const gate = useRef({ fresh: false, inView: false, live: false, first: loop[0] });

  // The first replay starts once the browser re-run is in and the workbench is on screen.
  const tryStart = useCallback(() => {
    const g = gate.current;
    if (g.live || !g.fresh || !g.inView || reducedNow()) return;
    g.live = true;
    setPos({ run: g.first, ev: 0 });
    setLive(true);
  }, []);

  // Re-run the engine in this browser so the timings on screen are measured here.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      import("./hero-run-data")
        .then((m) => m.buildHeroRuns())
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => undefined)
        .finally(() => {
          if (cancelled) return;
          gate.current.fresh = true;
          tryStart();
        });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [tryStart]);

  useEffect(() => {
    const el = rootRef.current;
    const seen = (v: boolean) => {
      gate.current.inView = v;
      setInView(v);
      tryStart();
    };
    if (!el || !("IntersectionObserver" in window)) {
      const t = window.setTimeout(() => seen(true), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(([e]) => seen(e.isIntersecting && e.intersectionRatio >= 0.15), { threshold: [0, 0.15, 0.4] });
    io.observe(el);
    return () => io.disconnect();
  }, [tryStart]);

  const running = live && !reduced && !paused && inView && !pageHidden && pinned === null;
  useEffect(() => {
    if (!running) return;
    const cur = timelines[pos.run][pos.ev];
    const id = window.setTimeout(() => {
      setPos((p) => {
        if (p.ev + 1 < timelines[p.run].length) return { run: p.run, ev: p.ev + 1 };
        const at = loop.indexOf(p.run);
        return { run: loop[(at + 1) % loop.length], ev: 0 };
      });
    }, cur.ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pos, timelines]);

  const c = data.cases[pos.run];
  const tl = timelines[pos.run];
  const ev = tl[reduced ? tl.length - 1 : Math.min(pos.ev, tl.length - 1)].ev;
  const stepsShown = ev.kind === "select" ? 0 : ev.kind === "step" ? ev.i + 1 : c.steps.length;
  const runningStep = ev.kind === "step" && !ev.done ? ev.i : -1;
  const summaryStep = ev.kind === "step" && ev.done ? ev.i : -1;
  const visibleIds = new Set<string>([c.customerId, c.records[2].id, ...c.txns.map((t) => t.id)].filter(Boolean));
  const recShown = ev.kind === "rec" || ev.kind === "claim" || ev.kind === "hold";
  const claimsShown = ev.kind === "claim" ? ev.k + 1 : ev.kind === "hold" ? c.claims.length : 0;
  const autoActive = ev.kind === "claim" ? ev.k : ev.kind === "hold" ? 0 : null;
  const active = pinned !== null && pinned < claimsShown ? pinned : autoActive;
  const hot = new Set(active !== null ? c.claims[active]?.ids ?? [] : []);
  const cited = new Set(c.claims.slice(0, claimsShown).flatMap((x) => x.ids));
  const read = new Set(ev.kind === "step" ? c.steps[ev.i].ids : []);
  const done = recShown;
  const mark = markFor(c);
  const doneMs = c.steps.slice(0, stepsShown).reduce((s, x) => s + x.ms, 0);

  // Keep the newest claim in view inside its own scroll box. Never scrolls the page.
  useEffect(() => {
    const list = claimsRef.current;
    if (!list || !live || ev.kind !== "claim") return;
    const item = list.children[ev.k] as HTMLElement | undefined;
    if (!item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top + item.offsetHeight > list.scrollTop + list.clientHeight || top < list.scrollTop) list.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
  }, [ev, live]);

  const select = (i: number) => {
    setPinned(null);
    if (reduced || paused) {
      setPos({ run: i, ev: timelines[i].length - 1 });
      return;
    }
    gate.current.live = true;
    setLive(true);
    setPos({ run: i, ev: 0 });
  };

  let hotOrder = 0;
  const rowStyle = (id: string) => (hot.has(id) ? ({ "--d": hotOrder++ } as CSSProperties) : undefined);
  const rowClass = (id: string, trigger: boolean) =>
    ["hrun__row", hot.has(id) ? "is-hot" : cited.has(id) ? "is-cited" : "", read.has(id) ? "is-read" : "", trigger ? "is-trigger" : ""].filter(Boolean).join(" ");
  const recHot = (id: string) => (id && hot.has(id) ? " is-hot" : id && cited.has(id) ? " is-cited" : "") + (id && read.has(id) ? " is-read" : "");

  return (
    <figure className="hrun" ref={rootRef} data-live={live && !reduced ? "" : undefined} aria-labelledby="hrun-cap">
      <p className="visually-hidden">
        Example run on alert {c.alertId}, a {c.typologyLabel.toLowerCase()} alert on {c.customerName}. Result: {mark.title}, {mark.note}, with {c.claims.length} cited claim
        {c.claims.length === 1 ? "" : "s"}.
      </p>
      <div className="frame hrun__frame">
        <div className="frame__bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>assay / workbench / {c.alertId}</span>
        </div>
        <div className="hrun__appbar">
          <span className="hrun__ws">
            <LogoMark size={18} />
            Acme Financial <em>(synthetic)</em>
          </span>
          <span className="hrun__crumb" aria-hidden="true">
            Queue <Icon name="chevronRight" size={12} /> {c.alertId}
          </span>
          <span className={`hrun__status${done ? " is-done" : ""}`}>
            <i aria-hidden="true" />
            {done ? "Recommendation ready" : "Agent working"}
          </span>
        </div>

        <div className="hrun__body">
          {/* Queue rail */}
          <div className="hrun__rail" role="group" aria-label="Example queue. Pick an alert to replay it.">
            <div className="hrun__railhead">
              <b>Queue</b>
              <span>{data.cases.length} open, by risk score</span>
            </div>
            <ol className="hrun__queue">
              {data.cases.map((q, i) => {
                const sel = i === pos.run;
                const showRec = !sel || recShown;
                const recCls = q.recommendation === "escalate" ? "rec-escalate" : q.recommendation === "close" ? "rec-close" : "rec-review";
                const recText = q.recommendation === "escalate" ? "Escalate" : q.recommendation === "close" ? "Close" : "Review";
                return (
                  <li key={q.alertId}>
                    <button type="button" className="hrun__q" aria-current={sel ? "true" : undefined} onClick={() => select(i)}>
                      <span className="hrun__qname">{q.customerName}</span>
                      <span className="hrun__qrisk num" title="Risk score">
                        <span className="visually-hidden">Risk score </span>
                        {q.riskScore}
                      </span>
                      <span className="hrun__qmeta">
                        <Icon name={TYPOLOGY_ICON[q.typology]} size={13} />
                        {q.typologyLabel}
                      </span>
                      <span className={`rec ${showRec ? recCls : "rec-hidden"} hrun__qrec`}>{showRec ? recText : "Working"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <dl className="hrun__policy">
              <div>
                <dt>Policy</dt>
                <dd>Version {DEFAULT_POLICY.version}</dd>
              </div>
              <div>
                <dt>Autonomy</dt>
                <dd>{c.autonomy}</dd>
              </div>
              <div>
                <dt>Close floor</dt>
                <dd className="num">{DEFAULT_POLICY.closeConfidenceFloor.toFixed(2)}</dd>
              </div>
            </dl>
          </div>

          {/* Center: the alert and its records */}
          <div className="hrun__center" role="group" aria-label={`Alert ${c.alertId}`} key={`c-${c.alertId}`}>
            <header className="hrun__alert">
              <div>
                <strong>{c.alertId}</strong>
                <span className="hrun__rule">{c.ruleCode}</span>
                <span className="hrun__typ">
                  <Icon name={TYPOLOGY_ICON[c.typology]} size={14} />
                  {c.typologyLabel}
                </span>
                <span className="hrun__age">{c.age} ago</span>
              </div>
              <p>{c.ruleDescription}</p>
            </header>
            <div className="hrun__records">
              <div className={`hrun__kyc${recHot(c.customerId)}`}>
                {c.records.slice(0, 2).map((r) => (
                  <div key={r.label} className="hrun__rec-row">
                    <span className="hrun__k">{r.label}</span>
                    <span className="hrun__v" title={r.text}>{r.text}</span>
                  </div>
                ))}
                <span className="stamp stamp-muted hrun__recid">
                  <span>{c.customerId}</span>
                </span>
              </div>
              <div className={`hrun__rec-row hrun__third${recHot(c.records[2].id)}`}>
                <span className="hrun__k">{c.records[2].label}</span>
                <span className="hrun__v" title={c.records[2].text}>{c.records[2].text}</span>
                {c.records[2].id && (
                  <span className="stamp stamp-muted hrun__recid">
                    <span>{c.records[2].id}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="hrun__tablewrap">
              <div className="hrun__table" role="table" aria-label="Transactions on this alert, most recent first">
                <div className="hrun__thead" role="row">
                  <span role="columnheader" className="hrun__c-id">
                    Record
                  </span>
                  <span role="columnheader">Date</span>
                  <span role="columnheader">Counterparty or branch</span>
                  <span role="columnheader">Channel</span>
                  <span role="columnheader" className="hrun__c-amt">
                    Amount
                  </span>
                </div>
                {c.txns.map((t) => (
                  <div key={t.id} role="row" className={rowClass(t.id, t.trigger)} style={rowStyle(t.id)}>
                    <span role="cell" className="hrun__c-id">
                      {t.id}
                      {t.trigger && <span className="visually-hidden"> (triggered the rule)</span>}
                    </span>
                    <span role="cell" className="num">
                      {t.date}
                    </span>
                    <span role="cell" className="hrun__party" title={t.memo ? `${t.party}. Memo: ${t.memo}` : t.party}>
                      {t.party}
                      {t.memo && <span className="hrun__memo"> &ldquo;{t.memo}&rdquo;</span>}
                    </span>
                    <span role="cell">{t.channel}</span>
                    <span role="cell" className={`hrun__c-amt num${t.out ? " is-out" : ""}`}>
                      {t.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="hrun__tfoot">
              <span>
                <i aria-hidden="true" /> Triggered the rule
              </span>
              <span className="num">
                {c.txns.length} of {c.txnCount} transactions in 90 days, plus {c.historyCount} older
              </span>
            </p>
          </div>

          {/* Right: the agent trace, then the recommendation */}
          <div className="hrun__trace" role="group" aria-label="Agent trace" key={`t-${c.alertId}`}>
            <header className="hrun__tracehead">
              <b>Agent trace</b>
              <span className="num">
                {done ? `${c.steps.length} steps, ${fmtMs(c.totalMs)}` : stepsShown ? `Step ${Math.min(stepsShown, c.steps.length)} of ${c.steps.length}, ${fmtMs(doneMs)}` : "Starting"}
              </span>
            </header>
            <ol className="hrun__steps">
              {c.steps.slice(0, stepsShown).map((s, i) => {
                const isRun = i === runningStep;
                const showSummary = i === summaryStep;
                return (
                  <li key={s.tool + i} className={`hrun__step${isRun ? " is-running" : ""}${s.flag ? " is-flag" : ""}`} title={s.summary}>
                    <span className="hrun__sicon" aria-hidden="true">
                      {isRun ? <i className="hrun__spin" /> : <Icon name={s.label === "Model not called" ? "lock" : STEP_ICON[s.tool] ?? "check"} size={14} />}
                    </span>
                    <span className="hrun__slabel">{s.label}</span>
                    {s.flag ? <em className="hrun__flag">{s.flag}</em> : <span aria-hidden="true" />}
                    <span className="hrun__sms num">{isRun ? "running" : fmtMs(s.ms)}</span>
                    <span className={`hrun__ssum${showSummary ? " is-open" : ""}`}>{s.summary}</span>
                  </li>
                );
              })}
            </ol>
            <div className="hrun__out">
              {recShown && (
                <>
                  <div className="hrun__verdict">
                    <span className={`mark ${mark.cls}`}>
                      <span>
                        <strong>{mark.title}</strong>
                        <small>{mark.note}</small>
                      </span>
                    </span>
                    <p>{recLine(c)}</p>
                  </div>
                  <span className="visually-hidden" id="hrun-claim-hint">
                    Highlights the records this claim cites.
                  </span>
                  <ol className="hrun__claims" ref={claimsRef} aria-label="Cited claims">
                    {c.claims.slice(0, claimsShown).map((cl, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          className={`hrun__claim${active === k ? " is-active" : ""}`}
                          aria-describedby="hrun-claim-hint"
                          onMouseEnter={() => setPinned(k)}
                          onMouseLeave={() => setPinned(null)}
                          onFocus={() => setPinned(k)}
                          onBlur={() => setPinned(null)}
                          onClick={() => setPinned(k)}
                        >
                          <span className="hrun__ctext">{cl.text}</span> <Chips ids={cl.ids} visible={visibleIds} pulse={live && ev.kind === "claim" && ev.k === k} />
                        </button>
                      </li>
                    ))}
                  </ol>
                  {c.quarantine && claimsShown > 0 && (
                    <div className={`hrun__quar${hot.has(c.quarantine.id) ? " is-hot" : ""}`}>
                      <span>
                        <Icon name="lock" size={13} /> {c.quarantine.field} on {c.quarantine.id}, held back from the model
                      </span>
                      <q>{c.quarantine.text}</q>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <figcaption className="hrun__caption" id="hrun-cap">
        <p>
          A real run of the triage engine on five synthetic alerts, run again in your browser when the page loads. Playback is slowed so you can follow it; the step timings are measured. The demo uses the
          deterministic rules model, which answers in about a millisecond. A live model takes a few seconds.
        </p>
        <div className="hrun__controls">
          {!reduced && (
            <button type="button" className="btn btn-small btn-outline hrun__pause" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
              <Icon name={paused ? "play" : "pause"} size={14} />
              Pause<span className="visually-hidden"> the replay</span>
            </button>
          )}
          <Link className="arrow-link" href="/demo" data-track="hero_run_demo">
            Open this alert type in the demo
          </Link>
        </div>
      </figcaption>
    </figure>
  );
}
