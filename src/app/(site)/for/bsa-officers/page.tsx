import type { Metadata } from "next";
import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { demoAlertCount } from "@/components/site/DesignPartner";
import { Frame } from "@/components/site/Frame";
import { DEFAULT_POLICY, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import "../../content.css";

export const metadata: Metadata = {
  title: "For BSA officers",
  description:
    "Every alert disposition with a cited rationale, a named decision-maker and a tamper-evident record. A SAR clock that starts where the FFIEC manual says. Built for the person whose name is on the program.",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

const JOBS = [
  {
    job: "Show why every alert closed, months later",
    how: (
      <>
        The <b>alert workspace</b> shows a <b>cited rationale</b> for each recommendation: every claim links to the transaction, KYC record, prior case or watchlist entry behind it. Citations and dollar figures are checked against the
        records before the analyst sees them, and a claim that cites nothing sends the alert to human review.
      </>
    ),
  },
  {
    job: "Keep the SAR clock where the regulation puts it",
    how: (
      <>
        The <b>L2 investigation view</b> starts the SAR clock only when an investigator records a suspicion determination, then counts 30 days, or 60 when no suspect is identified. The <b>queue</b> shows your internal review deadline (default{" "}
        {DEFAULT_POLICY.internalSlaDays} days) separately, so nobody confuses the two.
      </>
    ),
  },
  {
    job: "See the backlog before an examiner does",
    how: (
      <>
        The <b>queue</b> ranks open alerts by risk score and shows days left against your internal deadline on every one. <b>Team workload</b> shows open alerts and their age per analyst, so a growing pile is visible in week one, not at
        the next exam.
      </>
    ),
  },
  {
    job: "Decide how much the agent may do, alert type by alert type",
    how: (
      <>
        The <b>autonomy ladder</b> in <b>policy settings</b> runs from L0 shadow to L3 auto-close per typology. Moving a type to auto-close takes an owner or admin attesting to {pct(L3_MIN_AGREEMENT)} agreement on{" "}
        {L3_MIN_QA.toLocaleString("en-US")} QA-reviewed alerts and written approval. Only owners and admins can change policy, and each change gets a version number.
      </>
    ),
  },
  {
    job: "Set how much no-SAR rationale to keep",
    how: (
      <>
        FinCEN&apos;s October 2025 FAQ says there is no requirement to document a decision not to file; the FFIEC manual still says banks should.
        <sup>
          <Link href="/sources#fincen-sar-faq-2025">5</Link>
        </sup>{" "}
        <b>Policy settings</b> let you choose full or standard depth. The default is full, and because the agent writes the rationale anyway, the cost is storage, not analyst time.
      </>
    ),
  },
  {
    job: "Hand the examiner a file, not a reconstruction",
    how: (
      <>
        The <b>audit log export</b> gives every run, decision and policy change as CSV or JSON, with the model and policy version on each entry. The log is a SHA-256 hash chain, re-verified each time it is viewed, so an edit or deletion
        anywhere shows up.
      </>
    ),
  },
];

export default function BsaOfficersPage() {
  return (
    <>
      <header className="ph ph--navy">
        <Guilloche className="ph__rosette" size={620} />
        <div className="wrap">
          <nav className="ph__crumb" aria-label="Breadcrumb">
            <span>Solutions</span>
            <span aria-hidden="true">/</span>
            <span>BSA officers</span>
          </nav>
          <p className="kicker">For BSA officers</p>
          <h1>Your name is on every alert your team closes. You read almost none of them.</h1>
          <p className="ph__lede">
            When an examiner asks why a run of structuring alerts closed with two-line notes, the answer should be a file, not a reconstruction. Assay gives every disposition a cited rationale, a named decision-maker and a tamper-evident record.
            The agent recommends. Your people decide.
          </p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo" data-track="bsa-demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot" data-track="bsa-pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </header>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">What your week looks like now</p>
            <h2>Most of the queue is noise, and the clock still runs on the part that is not.</h2>
          </div>
          <dl className="figures">
            <div>
              <dt>
                of transaction-monitoring alerts are false positives at most banks{" "}
                <sup>
                  <Link href="/sources#mckinsey-2020">1</Link>
                </sup>
              </dt>
              <dd>90%+</dd>
            </div>
            <div>
              <dt>
                to file once review finds the activity suspicious, or 60 with no suspect identified{" "}
                <sup>
                  <Link href="/sources#ffiec-sar">2</Link>
                </sup>
              </dt>
              <dd>30 days</dd>
            </div>
            <div>
              <dt>
                SARs filed by US institutions in fiscal 2025{" "}
                <sup>
                  <Link href="/sources#fincen-fy2025">3</Link>
                </sup>
              </dt>
              <dd>4.8M</dd>
            </div>
            <div>
              <dt>
                modeled L1 labor per alert: 30 minutes at $57.69 an hour <span className="c-modeled">Modeled</span>{" "}
                <sup>
                  <Link href="/sources">4</Link>
                </sup>
              </dt>
              <dd>$28.85</dd>
            </div>
          </dl>

          <div className="c-quote-split">
            <blockquote className="quote">
              Banks should document SAR decisions, including the specific reason for filing or not filing a SAR.
              <footer>
                FFIEC BSA/AML Examination Manual, Suspicious Activity Reporting. <Link href="/sources#ffiec-sar">Source</Link>
              </footer>
            </blockquote>
            <div>
              <p>
                The risk in a BSA program is rarely the alert that got escalated. It is the backlog that aged past your own policy, and the closes nobody can explain a year later because the reasoning lived in an analyst&apos;s head.
              </p>
              <p>
                A modeled team of six L1 analysts working 12 alerts a day each clears 360 alerts a week, about 180 analyst hours. At a 90% false positive rate, more than 320 of those are closes, and each one is a decision someone may ask you to
                defend. <span className="c-modeled">Modeled</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--sheet">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">Jobs it does for you</p>
            <h2>Six things a BSA officer needs, and the screen that does each one.</h2>
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
        <div className="wrap split split--rev">
          <div className="c-shot-copy">
            <p className="kicker">Audit log</p>
            <h2>One log, chained, exportable.</h2>
            <p>
              Each entry records who acted, human or agent, what they did, and the model and policy version in force. Each row&apos;s hash covers the one before it, so changing any past entry breaks every hash after it. The workbench re-checks
              the chain every time the log is opened.
            </p>
            <ul className="checks">
              <li>Agent runs, with the claims, citations and policy rules that fired</li>
              <li>Human decisions, with a reason code on every override</li>
              <li>Policy changes, with before and after values</li>
              <li>Export as CSV or JSON for the exam file</li>
            </ul>
          </div>
          <Frame src="/shots/audit.png" alt="The Assay audit log: a table of agent runs, analyst decisions and policy changes, each with a hash and the policy version, and a banner confirming the hash chain verified." url="assay / audit log" />
        </div>
      </section>

      <section className="sec sec--deep">
        <div className="wrap c-not">
          <div>
            <p className="kicker">What Assay will not do for you</p>
            <h2>The decisions with your name on them stay with people.</h2>
            <p>
              These are not settings someone can switch on later. The code has no path for the agent to take them, and a SAR decision can only be recorded by a signed-in person.
            </p>
            <p>
              <Link className="arrow-link" href="/governance">
                How governance works
              </Link>
            </p>
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
          <h2>See a structuring alert go from rule hit to cited escalation.</h2>
          <p>The demo runs in your browser on {demoAlertCount()} synthetic alerts. Open the first one and check every citation against the records yourself.</p>
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
