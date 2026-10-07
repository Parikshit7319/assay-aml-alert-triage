import type { Metadata } from "next";
import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { demoAlertCount } from "@/components/site/DesignPartner";
import { Frame } from "@/components/site/Frame";
import { DEFAULT_POLICY, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { OVERRIDE_REASONS, TYPOLOGY_LABEL } from "@/lib/labels";
import "../../content.css";

export const metadata: Metadata = {
  title: "For analyst team leads",
  description:
    "Evidence assembled before the analyst opens the alert, QA sampling built into the queue, and workload by analyst. For leads running 2 to 25 L1 analysts on transaction-monitoring alerts.",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/* Modeled team. Every input is stated so the arithmetic can be checked. */
const TEAM = 8;
const PER_DAY = 12; // 6 productive hours at 30 minutes per alert (1,560 productive hours a year / 260 days)
const MINUTES = 30;
const CLOSE_RATE = 0.92; // same close rate the /sources time-saved assumption uses
const weekly = TEAM * PER_DAY * 5;
const hours = (weekly * MINUTES) / 60;
const closes = Math.round(weekly * CLOSE_RATE);
const qa = Math.round(closes * DEFAULT_POLICY.qaSampleRate);

const batchTypes = (Object.entries(DEFAULT_POLICY.autonomy) as [keyof typeof TYPOLOGY_LABEL, number][]).filter(([, l]) => l >= 2).map(([t]) => TYPOLOGY_LABEL[t].toLowerCase());

export default function AnalystLeadsPage() {
  const JOBS = [
    {
      job: "Clear the obvious closes faster without lowering the bar",
      how: (
        <>
          The <b>alert workspace</b> opens with the evidence already pulled: customer profile, 90 days of transactions plus three years of history, prior alerts and SARs, and watchlist screening. The analyst reviews a <b>cited rationale</b>{" "}
          instead of building one. In a new workspace, {batchTypes.join(" and ")} alerts start at batch approval; every other type starts at recommend.
        </>
      ),
    },
    {
      job: "Get two analysts to the same answer",
      how: (
        <>
          The same policy rules run before and after the model on every alert, whoever opens it. Overriding the agent takes one of {OVERRIDE_REASONS.length} reason codes, from &ldquo;{OVERRIDE_REASONS[0].label.toLowerCase()}&rdquo; to
          &ldquo;{OVERRIDE_REASONS[OVERRIDE_REASONS.length - 1].label.toLowerCase()}&rdquo;, so disagreements are countable instead of anecdotal.
        </>
      ),
    },
    {
      job: "Run QA without a spreadsheet",
      how: (
        <>
          <b>QA sampling</b> draws {pct(DEFAULT_POLICY.qaSampleRate)} of agent-assisted closes by default, from every batch. A reviewer marks agree or disagree, a disagreement needs a written note, and agreement rolls up by alert type on the <b>metrics</b> screen.
          You change the rate in <b>policy settings</b>.
        </>
      ),
    },
    {
      job: "Teach new analysts on live alerts",
      how: (
        <>
          Every recommendation carries its <b>investigation trace</b>: read the alert, read the profile, pull history, check prior cases, run typology checks, apply policy, assess. A new hire sees how a case is worked on every alert, and the
          override log shows where experienced analysts see it differently.
        </>
      ),
    },
    {
      job: "Balance the queue before it tips",
      how: (
        <>
          <b>Team workload</b> shows each analyst&apos;s open alerts and their age against your internal deadline. The <b>queue</b> ranks open alerts by risk score and shows days left on each, so the one about to breach policy is easy to spot.
        </>
      ),
    },
    {
      job: "Take the noise off people",
      how: (
        <>
          When a file is too thin to decide (fewer than {DEFAULT_POLICY.minTransactionsForDecision} transactions in the lookback window), the agent abstains and says why instead of guessing. Memos that try to instruct the agent lock the alert
          for a human. Clean closes on eligible alert types go in a batch, not one at a time.
        </>
      ),
    },
  ];

  return (
    <>
      <header className="ph ph--navy">
        <Guilloche className="ph__rosette" size={620} />
        <div className="wrap">
          <nav className="ph__crumb" aria-label="Breadcrumb">
            <span>Solutions</span>
            <span aria-hidden="true">/</span>
            <span>Analyst team leads</span>
          </nav>
          <p className="kicker">For analyst team leads</p>
          <h1>Your analysts spend the day assembling evidence. You spend yours checking it.</h1>
          <p className="ph__lede">
            Throughput, consistency and QA all come back to the same 30 minutes per alert, most of it spent pulling records and writing up why something is fine. Assay does the pulling and the first draft, with a citation on every claim, so your
            team spends its time on judgment and you spend yours on the cases that need you.
          </p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo" data-track="leads-demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot" data-track="leads-pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </header>

      <section className="sec">
        <div className="wrap split split--top">
          <div>
            <p className="kicker">What your week looks like now</p>
            <h2>
              A modeled team of {TEAM}. <span className="c-modeled">Modeled</span>
            </h2>
            <p className="split__lede">
              Check the arithmetic against your own team. The 30-minute review time and 1,560 productive hours a year are the same assumptions used across this site.{" "}
              <Link href="/sources">Sources and assumptions</Link>
            </p>
            <figure className="c-bar" style={{ marginTop: 40 }}>
              <div className="c-bar__track" aria-hidden="true">
                <span className="c-bar__seg c-bar__seg--admin" style={{ width: "85%" }}>
                  Administrative or nonanalytical, up to 85%
                </span>
                <span className="c-bar__seg c-bar__seg--judge" style={{ width: "15%" }}>
                  15%
                </span>
              </div>
              <figcaption>
                As much as 85% of financial crime compliance activity is administrative or nonanalytical.{" "}
                <sup>
                  <Link href="/sources#mckinsey-2020">1</Link>
                </sup>{" "}
                That is the share Assay goes after. The judgment stays with your analysts.
              </figcaption>
            </figure>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <caption className="visually-hidden">Modeled weekly workload for a team of {TEAM} L1 analysts</caption>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">How</th>
                  <th scope="col" className="num">
                    Per week
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>L1 analysts</td>
                  <td>Inside the 2 to 25 range the Team plan is built for</td>
                  <td className="num">{TEAM}</td>
                </tr>
                <tr>
                  <td>Alerts per analyst per day</td>
                  <td>6 productive hours at {MINUTES} minutes each</td>
                  <td className="num">{PER_DAY}</td>
                </tr>
                <tr>
                  <td>Alerts worked</td>
                  <td>
                    {TEAM} &times; {PER_DAY} &times; 5 days
                  </td>
                  <td className="num">{weekly}</td>
                </tr>
                <tr>
                  <td>Analyst hours on alerts</td>
                  <td>
                    {weekly} &times; {MINUTES} minutes
                  </td>
                  <td className="num">{hours}</td>
                </tr>
                <tr>
                  <td>Closed, no escalation</td>
                  <td>
                    {pct(CLOSE_RATE)} close rate, in line with 90%+ false positives
                    <sup>
                      <Link href="/sources#mckinsey-2020">1</Link>
                    </sup>
                  </td>
                  <td className="num">{closes}</td>
                </tr>
                <tr>
                  <td>Closes to re-review for QA</td>
                  <td>A {pct(DEFAULT_POLICY.qaSampleRate)} sample, usually by you</td>
                  <td className="num">{qa}</td>
                </tr>
              </tbody>
            </table>
            <p className="c-note">
              {closes} closes a week, each written up by hand, each one a place where two analysts can reach different answers. That is the consistency problem, and the burnout problem, in one number.
            </p>
          </div>
        </div>
      </section>

      <section className="sec sec--sheet">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">Jobs it does for you</p>
            <h2>What a team lead hires it for, and where each one lives in the product.</h2>
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
        <div className="wrap split">
          <div className="c-shot-copy">
            <p className="kicker">QA sampling</p>
            <h2>The QA sample draws itself.</h2>
            <p>
              Every batch of agent-assisted closes feeds a random sample to the QA queue. Reviewers see the recommendation, the citations and the analyst&apos;s decision side by side, and mark agree or disagree. Agreement by alert type is what
              earns that type more autonomy, and it is the number you will want in front of you when the BSA officer asks whether the tool is working.
            </p>
            <ul className="checks">
              <li>Sample rate set in policy, default {pct(DEFAULT_POLICY.qaSampleRate)}</li>
              <li>Agreement by alert type, and a reason code on every override</li>
              <li>Disagreements stay in the audit log with the reviewer&apos;s note</li>
            </ul>
          </div>
          <Frame src="/shots/qa.png" alt="The Assay QA queue: sampled closes with the agent's recommendation, the analyst's decision and agree or disagree controls for the reviewer." url="assay / qa" />
        </div>
      </section>

      <section className="sec sec--navy">
        <div className="wrap c-not">
          <div>
            <p className="kicker">What Assay will not do for you</p>
            <h2>It drafts. It does not decide the calls that matter most.</h2>
            <p>Your analysts and investigators keep these, by design. The product has no setting to hand them over.</p>
          </div>
          <ul className="checks checks--no">
            {NEVER_AUTOMATED.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cta">
        <Guilloche className="cta__rosette" size={640} />
        <div className="wrap">
          <h2>Work the queue the way your team would with Assay.</h2>
          <p>The demo runs in your browser on {demoAlertCount()} synthetic alerts, with the queue, QA sampling and metrics. No sign-up.</p>
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
