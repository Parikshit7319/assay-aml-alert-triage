import Link from "next/link";
import { HeroLedger } from "@/components/HeroLedger";
import { RoiCalculator } from "@/components/RoiCalculator";
import { AUTONOMY_LEVELS, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { PLANS } from "@/lib/plans";
import { startDemo } from "../demo-action";

export const revalidate = 86400;

const STEPS = [
  {
    name: "Intake",
    body: "An alert arrives from your monitoring system by CSV or API. Assay keeps your rule code and triggering transactions as they are.",
  },
  {
    name: "Investigate",
    body: "The agent pulls the customer profile, 90 days of transactions plus three years of history, prior alerts and SARs, and watchlist candidates.",
  },
  {
    name: "Check policy",
    body: "Deterministic rules run before and after the model. Watchlist matches go to L2. Instructions hidden in memos lock the alert. Thin files abstain.",
  },
  {
    name: "Recommend",
    body: "Close or escalate, with a confidence score and a citation on every claim. Citations and dollar figures are checked against the records before anyone sees them.",
  },
  {
    name: "Decide",
    body: "An analyst accepts or overrides with a reason code. Every decision lands in a hash-chained audit log with the model and policy version.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <h1>An AI first pass on every AML alert, with a citation behind every claim.</h1>
            <p className="hero__lede">
              Assay reads the alert, gathers the evidence, and recommends close or escalate. Your analysts make the call. Deterministic rules decide what the model is not allowed to.
            </p>
            <div className="hero__actions">
              <form action={startDemo}>
                <button className="btn" type="submit">
                  Open the demo
                </button>
              </form>
              <Link className="btn btn-outline" href="/pilot">
                Request a pilot
              </Link>
            </div>
            <p className="hero__fine">The demo opens a private workspace with 44 synthetic alerts. No sign-up.</p>
          </div>
          <div className="hero__visual">
            <HeroLedger />
          </div>
        </div>
      </section>

      <section className="section section--ruled">
        <div className="wrap problem">
          <h2>Most of the queue is noise, and every alert still takes an analyst&apos;s time.</h2>
          <div className="problem__body">
            <p>
              For most banks, <strong>more than 90%</strong> of transaction-monitoring alerts turn out to be false positives, and only one or two in a hundred are acted on.
              <sup>
                <Link href="/sources#mckinsey-2020">1</Link>
              </sup>{" "}
              As much as <strong>85%</strong> of financial crime compliance work is administrative rather than analytical.
              <sup>
                <Link href="/sources#mckinsey-2020">1</Link>
              </sup>
            </p>
            <p>
              The output still matters: US institutions filed <strong>4.8 million</strong> suspicious activity reports in fiscal 2025.
              <sup>
                <Link href="/sources#fincen-fy2025">2</Link>
              </sup>{" "}
              The work in between is gathering the same records for every alert, writing up why it is fine, and moving on. That is the part Assay takes.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>How an alert moves through Assay</h2>
            <p>Five steps, in order. The model sits in the middle of the sequence, not at the end of it.</p>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.name}>
                <span className="steps__n num">{i + 1}</span>
                <h3>{s.name}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--sheet">
        <div className="wrap split">
          <div>
            <h2>Autonomy is earned per alert type, with data.</h2>
            <p className="split__lede">
              A new workspace starts at Recommend. Payroll and seasonal alerts can move to batch approval once QA agreement holds. Auto-close requires 98% agreement on 2,000 QA-reviewed alerts and written sign-off.
            </p>
            <ol className="ladder">
              {AUTONOMY_LEVELS.map((l) => (
                <li key={l.level}>
                  <span className="ladder__level num">L{l.level}</span>
                  <div>
                    <h3>{l.name}</h3>
                    <p>{l.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="never">
            <h2>What it will never do</h2>
            <ul>
              {NEVER_AUTOMATED.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p>
              These are not settings. There is no code path for the agent to take these actions. A SAR decision can only be recorded by a signed-in person.
            </p>
            <Link href="/governance">Read how governance works</Link>
          </div>
        </div>
      </section>

      <section className="section" id="roi">
        <div className="wrap split split--wide">
          <div>
            <h2>What it could give back to your team</h2>
            <p className="split__lede">
              Set your own numbers. The time-saved default comes from our model: half the review time on alerts that close, a fifth on alerts that escalate.
            </p>
          </div>
          <RoiCalculator />
        </div>
      </section>

      <section className="section section--ruled">
        <div className="wrap pricing-teaser">
          <div>
            <h2>Priced per alert triaged, published openly.</h2>
            <p>
              {PLANS.sandbox.name} is free on test data. {PLANS.team.name} is ${PLANS.team.priceMonthlyUsd?.toLocaleString()} a month with {PLANS.team.includedRuns?.toLocaleString()} alerts included, then ${PLANS.team.overagePerRunUsd?.toFixed(2)} each. Enterprise runs in your own Azure subscription.
            </p>
          </div>
          <Link href="/pricing" className="btn btn-outline">
            See pricing
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="wrap founder">
          <h2>Early, and looking for two design partners</h2>
          <p>
            Assay is built by Parikshit Ambhore, who spent five years building payments and transfer agency platforms, including institutional transfer agency delivery for a global asset manager, and LLM workflow automation. If your team works more than 1,000 alerts a month and wants to measure an agent against your own QA, the pilot is a shadow-mode run on your historical alerts first.
          </p>
          <Link href="/pilot" className="btn">
            Request a pilot
          </Link>
        </div>
      </section>
    </>
  );
}
