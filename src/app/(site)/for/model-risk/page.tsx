import type { Metadata } from "next";
import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { demoAlertCount } from "@/components/site/DesignPartner";
import { Frame } from "@/components/site/Frame";
import { AUTONOMY_LEVELS, DEFAULT_POLICY, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { MODEL_RISK_SECTIONS } from "@/lib/exports/model-risk";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import "../../content.css";

export const metadata: Metadata = {
  title: "For model risk",
  description:
    "SR 26-2 put agentic AI outside model risk guidance. Assay records the model, provider and policy version on every run, measures agreement in shadow mode and QA, and exports a model risk documentation pack.",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

const JOBS = [
  {
    job: "Know exactly what produced a recommendation",
    how: (
      <>
        Every run records the agent identity, the provider, the model and the policy version, with the full investigation trace and token counts. Past runs keep the policy version they ran under, so a later change never rewrites history.
      </>
    ),
  },
  {
    job: "Assess conceptual soundness",
    how: (
      <>
        The method is split on purpose. Typology checks (structuring, funnel, wires, payroll, seasonality) and the policy rules are deterministic code you can read and test. The model only assesses those findings and writes cited claims. The{" "}
        <b>model risk documentation export</b> describes inputs, method, controls and known limitations.
      </>
    ),
  },
  {
    job: "Run outcomes analysis before anyone relies on it",
    how: (
      <>
        <b>Shadow mode comparison</b> (autonomy level L0) runs the agent on alerts your analysts decide, keeps its output hidden, and reports agreement, missed escalations (agent would close, human escalated) and over-escalations by alert
        type.
      </>
    ),
  },
  {
    job: "Monitor it once it is live",
    how: (
      <>
        <b>QA sampling</b> pulls {pct(DEFAULT_POLICY.qaSampleRate)} of agent-assisted closes for a second reviewer by default. The <b>metrics</b> screen tracks QA agreement, the override rate and each alert type&apos;s progress toward its
        autonomy bar. Every override carries a reason code in the decision log.
      </>
    ),
  },
  {
    job: "Control change",
    how: (
      <>
        <b>Policy settings</b> can be changed only by workspace owners and admins. Each save creates a new policy version and writes the before and after values to the hash-chained <b>audit log</b>. The agent has no path to change its own
        policy.
      </>
    ),
  },
  {
    job: "Hand effective challenge a document",
    how: (
      <>
        The <b>model risk documentation export</b> produces a print-ready pack in {MODEL_RISK_SECTIONS.length} sections, filled from live policy, run and QA statistics, ending in a sign-off block.
      </>
    ),
  },
];

const VERSIONED: { item: string; where: string; changes: string; gap?: string }[] = [
  { item: "Model and provider", where: "On every run", changes: "When an owner or admin picks a different model in policy settings" },
  { item: "Policy", where: "Version number on every run; before and after values in the audit log", changes: "On every saved change to thresholds, autonomy levels or QA rate" },
  { item: "Agent identity", where: "On every run and every agent entry in the audit log", changes: "One identity per workspace" },
  { item: "Decisions", where: "Decision record and audit log, with reason codes on overrides", changes: "Each human action" },
  {
    item: "System prompt",
    where: "A short hash of the prompt template (for example p-3f9a1c2e) on every run, in the audit log and in the documentation pack",
    changes: "Only with a code release, the same for every workspace on that release",
  },
];

export default function ModelRiskPage() {
  const thresholds = [
    { v: DEFAULT_POLICY.closeConfidenceFloor.toFixed(2), l: "confidence floor for a close; below it the alert goes to human review" },
    { v: DEFAULT_POLICY.watchlistForceL2Similarity.toFixed(2), l: "watchlist name similarity that forces L2, whatever the model says" },
    { v: String(DEFAULT_POLICY.minTransactionsForDecision), l: "fewer transactions than this and the agent abstains" },
    { v: pct(DEFAULT_POLICY.qaSampleRate), l: "of agent-assisted closes sampled for QA by default" },
    { v: DEFAULT_POLICY.autoCloseConfidenceFloor.toFixed(2), l: "confidence floor for auto-close, at autonomy level L3 only" },
    { v: `${pct(L3_MIN_AGREEMENT)} on ${L3_MIN_QA.toLocaleString("en-US")}`, l: "QA agreement and sample an owner attests to before L3" },
  ];

  return (
    <>
      <header className="ph ph--navy">
        <Guilloche className="ph__rosette" size={620} />
        <div className="wrap">
          <nav className="ph__crumb" aria-label="Breadcrumb">
            <span>Solutions</span>
            <span aria-hidden="true">/</span>
            <span>Model risk</span>
          </nav>
          <p className="kicker">For model risk management</p>
          <h1>The new guidance scoped agentic AI out. Your validation file still needs a chapter on it.</h1>
          <p className="ph__lede">
            In April the Fed, OCC and FDIC replaced SR 11-7 and the 2021 BSA/AML model statement, and put generative and agentic AI outside the new guidance. An agent in the alert queue now falls to your bank&apos;s own risk management. Assay is
            built to give that process evidence: what ran, under which version, how often people agreed with it, and what it is not allowed to do.
          </p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo" data-track="mrm-demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot" data-track="mrm-pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </header>

      <section className="sec">
        <div className="wrap split split--wide split--top">
          <div>
            <p className="kicker">What your week looks like now</p>
            <h2>A business line wants an agent in the queue. There is no guidance to validate it against.</h2>
          </div>
          <ol className="ruled">
            <li>
              <h3>April 17, 2026</h3>
              <div>
                <p>
                  SR 26-2, issued with OCC Bulletin 2026-13, supersedes SR 11-7 and SR 21-8, the interagency statement that tied BSA/AML systems to model risk management.
                  <sup>
                    <Link href="/sources#sr-26-2">1</Link>
                  </sup>
                </p>
              </div>
            </li>
            <li>
              <h3>Footnote 3</h3>
              <div>
                <p>
                  Generative and agentic AI models are &ldquo;novel and rapidly evolving&rdquo; and outside the guidance. Controls for tools it does not cover fall back to the bank&apos;s own risk management and governance practices.
                  <sup>
                    <Link href="/sources#sr-26-2">1</Link>
                  </sup>
                </p>
              </div>
            </li>
            <li>
              <h3>The definition of a model</h3>
              <div>
                <p>
                  Deterministic rule-based processes without statistical, economic or financial theory behind them are excluded. So the rules layer of a triage tool is not a model either. Neither half of the tool is covered.
                  <sup>
                    <Link href="/sources#sr-26-2">1</Link>
                  </sup>
                </p>
              </div>
            </li>
            <li>
              <h3>April 7, 2026</h3>
              <div>
                <p>
                  FinCEN&apos;s proposed program rule would have examiners consider whether a bank is employing innovative tools such as AI. Still a proposal at last check.
                  <sup>
                    <Link href="/sources#fincen-nprm-2026">2</Link>
                  </sup>
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="sec sec--sheet">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">Jobs it does for you</p>
            <h2>The validation questions, and where the answers come from.</h2>
            <p>
              Borrow the structure SR 26-2 uses for models in scope: conceptual soundness, outcomes analysis, ongoing monitoring, change control, documentation. I wrote up the full control set in{" "}
              <Link href="/insights/sr-26-2-agentic-ai-controls">SR 26-2 left agentic AI out of scope</Link>.
            </p>
          </div>
          <ol className="jobs">
            {JOBS.map((j) => (
              <li key={j.job}>
                <h3>{j.job}</h3>
                <p>{j.how}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">What is versioned</p>
            <h2>Five things you will be asked to pin down, and one gap.</h2>
          </div>
          <div className="tbl-scroll">
            <table className="tbl c-versioned">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Where it is recorded</th>
                  <th scope="col">When it changes</th>
                </tr>
              </thead>
              <tbody>
                {VERSIONED.map((v) => (
                  <tr key={v.item}>
                    <td>{v.item}</td>
                    <td>
                      {v.where}
                      {v.gap && (
                        <>
                          <br />
                          <span className="c-gap">Gap: </span>
                          {v.gap}
                        </>
                      )}
                    </td>
                    <td>{v.changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="c-h3" style={{ marginTop: 56 }}>
            Default thresholds, read from the policy code
          </h3>
          <dl className="c-thresholds" style={{ marginTop: 14 }}>
            {thresholds.map((t) => (
              <div key={t.l}>
                <dt>{t.l}</dt>
                <dd>{t.v}</dd>
              </div>
            ))}
          </dl>
          <p className="c-note">
            Every value is a setting your policy owners can change, and every change is versioned. The L3 gate is an attestation by an owner or admin today, backed by the QA progress shown on the metrics screen; it is not yet an automatic lock.
          </p>
        </div>
      </section>

      <section className="sec sec--deep">
        <div className="wrap split split--rev">
          <div className="c-shot-copy">
            <p className="kicker">Shadow mode comparison</p>
            <h2>Outcomes analysis on your own dispositions.</h2>
            <p>
              At L0 the agent runs on every alert of a type and nobody sees its answer. The comparison screen sets its calls against your analysts&apos; and breaks the result down by alert type.
            </p>
            <ul className="checks">
              <li>Agreement rate on alerts the agent decided</li>
              <li>Missed escalations: agent would have closed, analyst escalated</li>
              <li>Over-escalations: agent escalated, analyst closed</li>
              <li>Share sent to human review by policy</li>
            </ul>
          </div>
          <Frame src="/shots/shadow.png" alt="Assay's shadow mode comparison: a matrix of agent calls against analyst decisions with agreement, missed escalation and over-escalation rates by alert type." url="assay / shadow mode" />
        </div>
      </section>

      <section className="sec">
        <div className="wrap split split--top">
          <div>
            <p className="kicker">Model risk documentation export</p>
            <h2>The pack, section by section.</h2>
            <p className="split__lede">Generated from the workspace&apos;s live policy, run statistics and QA results, as a standalone document you can print, sign and file.</p>
          </div>
          <ol className="c-sections" aria-label="Sections of the model risk documentation pack">
            {MODEL_RISK_SECTIONS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec sec--sheet">
        <div className="wrap c-not">
          <div>
            <p className="kicker">What Assay will not do for you</p>
            <h2>Hard limits, in code, not in the prompt.</h2>
            <p>
              A sentence in a system prompt is not a control. These four actions have no code path at all, which makes them testable: there is nothing to switch on. Autonomy above recommend is set per alert type, from{" "}
              {AUTONOMY_LEVELS[0].name.toLowerCase()} to {AUTONOMY_LEVELS[AUTONOMY_LEVELS.length - 1].name.toLowerCase()}, and never covers these.
            </p>
          </div>
          <ul className="checks checks--no">
            {NEVER_AUTOMATED.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="wrap" style={{ marginTop: 56 }}>
          <div className="status">
            <span className="status__label">Not yet</span>
            <div>
              <h3>What your validators will not find, because it does not exist yet</h3>
              <ul>
                <li>No independent model validation and no third-party penetration test.</li>
                <li>No SOC 2 report. See the <Link href="/security">security page</Link> for the plan.</li>
                <li>No production alerts processed. The demo runs on {demoAlertCount()} synthetic alerts.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <Guilloche className="cta__rosette" size={640} />
        <div className="wrap">
          <h2>Put it through your own challenge process first.</h2>
          <p>Design partners get the control documentation and source access for their model risk review, and a shadow-mode pilot before any analyst sees a recommendation.</p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
