import type { Metadata } from "next";
import Link from "next/link";
import { LOOKBACK_OFFER, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing", description: "Sandbox free, Team $1,500 a month with 2,000 alerts included, Enterprise in your own Azure subscription." };

const FAQ = [
  ["What counts as a run?", "One alert worked by the agent, whatever the outcome: recommendation, abstention or a policy lock. Re-sending an alert ID that already exists is not billed. Re-running an alert after a policy change is."],
  ["Why per alert?", "Alert volume is how your team already measures the workload, so the price scales with the work it replaces. At the Team rate, the included alerts cost $0.75 each. Our model of L1 review puts the analyst time behind one alert at about $29."],
  ["Which model runs my alerts?", "On Team, Anthropic Claude, OpenAI or Azure OpenAI, configured by the operator. On Sandbox, the deterministic rules model. Every run records which one was used."],
  ["Can I use production data on Sandbox?", "No. Use test or synthetic data until a data processing agreement is signed. Production data starts with a design-partner pilot."],
  ["How do I cancel?", "From the billing portal at any time. The plan stays active to the end of the period, then the workspace returns to Sandbox. Your audit log stays exportable."],
];

export default function PricingPage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Priced per alert triaged</h1>
          <p>Published, so you can model it before a call. These prices are early and will be set with the first design partners.</p>
        </div>
      </header>
      <div className="wrap page-body">
        <div className="plans">
          {(["sandbox", "team", "enterprise"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <section key={id} className={`plan ${id === "team" ? "plan--featured" : ""}`}>
                <h2>{p.name}</h2>
                <div className="plan__price num">
                  {p.priceMonthlyUsd == null ? "Custom" : p.priceMonthlyUsd === 0 ? "$0" : `$${p.priceMonthlyUsd.toLocaleString()}`}
                  {p.priceMonthlyUsd ? <small> a month</small> : null}
                </div>
                <p>{p.summary}</p>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {id === "sandbox" && (
                  <Link className="btn btn-outline" href="/sign-up">
                    Create a free workspace
                  </Link>
                )}
                {id === "team" && (
                  <Link className="btn" href="/sign-up">
                    Start on Sandbox, upgrade in the app
                  </Link>
                )}
                {id === "enterprise" && (
                  <Link className="btn btn-outline" href="/pilot">
                    Request a pilot
                  </Link>
                )}
              </section>
            );
          })}
        </div>
        <div className="two-col" style={{ marginTop: 56 }}>
          <div className="prose">
            <h2 style={{ marginTop: 0 }}>{LOOKBACK_OFFER.name}</h2>
            <p>{LOOKBACK_OFFER.summary}</p>
            <h2>Questions</h2>
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </div>
          <aside className="aside-box">
            <h2>Model it on your numbers</h2>
            <p>The calculator on the home page uses your alert volume, review time and analyst cost.</p>
            <Link className="btn btn-outline" href="/#roi" style={{ width: "100%" }}>
              Open the calculator
            </Link>
          </aside>
        </div>
      </div>
    </>
  );
}
