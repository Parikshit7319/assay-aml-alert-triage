import type { Metadata } from "next";
import { OG_IMAGES } from "@/lib/og";
import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { ENTERPRISE_RUNS, LABOR_PER_ALERT, money2 } from "@/components/site/marketing-numbers";
import { UsageCalculator } from "@/components/site/UsageCalculator";
import { brand } from "@/lib/brand";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { buildScenarios } from "@/lib/demo/scenarios";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { LOOKBACK_OFFER, PLANS } from "@/lib/plans";
import { SIGN_UP_HREF } from "@/lib/site-mode";
import { prng } from "@/lib/util";
import "@/app/(site)/content.css";
import "@/components/site/marketing.css";

const team = PLANS.team;
const usd0 = (n: number) => `$${n.toLocaleString("en-US")}`;

export const metadata: Metadata = {
  title: "Pricing",
  description: `Priced per alert worked. ${PLANS.sandbox.name} is free, ${team.name} is ${usd0(team.priceMonthlyUsd ?? 0)} a month with ${(team.includedRuns ?? 0).toLocaleString("en-US")} runs included, Enterprise runs in your own Azure subscription.`,
  openGraph: { images: OG_IMAGES,
    title: `${brand.name} pricing: per alert worked, published`,
    description: `${PLANS.sandbox.name} free. ${team.name} ${usd0(team.priceMonthlyUsd ?? 0)} a month with ${(team.includedRuns ?? 0).toLocaleString("en-US")} runs, then ${money2(team.overagePerRunUsd ?? 0)} a run. Enterprise in your Azure subscription.`,
    type: "website",
  },
};

/** Average model tokens and modeled model cost per run, from the demo's alerts and the real prompt. */
async function tokenCost() {
  const { open, recentlyClosed, watchlist } = buildScenarios(prng(1), new Date("2026-01-05T15:00:00Z"));
  const provider = new SimulatedProvider();
  let runs = 0;
  let tokens = 0;
  let micros = 0;
  for (const s of [...open, ...recentlyClosed]) {
    const r = await runTriage(scenarioToBundle(s, watchlist, "ALT-COST"), DEFAULT_POLICY, provider);
    if (!r.inputTokens) continue;
    runs++;
    tokens += r.inputTokens + r.outputTokens;
    micros += r.costMicros;
  }
  return { tokens: Math.round(tokens / runs / 100) * 100, usd: micros / runs / 1_000_000 };
}

const PLAN_IDS = ["sandbox", "team", "enterprise"] as const;

function priceLine(id: (typeof PLAN_IDS)[number]) {
  const p = PLANS[id];
  if (p.priceMonthlyUsd == null) return { price: "Custom", per: null, meter: "Contract volume, single-tenant in your Azure subscription" };
  if (p.priceMonthlyUsd === 0) return { price: "$0", per: "/ month", meter: `${(p.includedRuns ?? 0).toLocaleString("en-US")} runs a month, rules model, test data` };
  return {
    price: usd0(p.priceMonthlyUsd),
    per: "/ month",
    meter: `${(p.includedRuns ?? 0).toLocaleString("en-US")} runs included, then ${money2(p.overagePerRunUsd ?? 0)} a run`,
  };
}

export default async function PricingPage() {
  const cost = await tokenCost();
  const includedEach = (team.priceMonthlyUsd ?? 0) / (team.includedRuns ?? 1);

  const FAQ: { q: string; a: React.ReactNode }[] = [
    {
      q: "What counts as a run?",
      a: (
        <>
          One alert worked by the agent, whatever the outcome: a recommendation, an abstention, or a policy lock that stops the alert before the model. Re-sending an alert ID that is already in the
          workspace returns a duplicate and is not billed. Opening, deciding, reviewing and exporting are never billed.
        </>
      ),
    },
    {
      q: "Is a re-run billed?",
      a: (
        <>
          Yes. Running an alert again, for example after you change a threshold or new transactions arrive, is a new run with its own entry in the audit log. That keeps the bill and the audit log counting
          the same thing.
        </>
      ),
    },
    {
      q: "What do live model calls cost, and who pays for them?",
      a: (
        <>
          On {team.name}, model usage is part of the run price. An average demo alert sends and receives about {cost.tokens.toLocaleString("en-US")} tokens, which is about ${cost.usd.toFixed(3)} at Claude
          Sonnet 5.5 list prices
          <sup>
            <Link href="/sources#anthropic-pricing">1</Link>
          </sup>
          , so the {money2(team.overagePerRunUsd ?? 0)} run price is mostly the product, not the tokens. On Enterprise the model is your own Azure OpenAI deployment and the tokens are on your Microsoft bill.
        </>
      ),
    },
    {
      q: "Where does our data live?",
      a: (
        <>
          {team.name} runs on the hosted edition; the providers behind it are listed on <Link href="/security">Security</Link>. Enterprise deploys single-tenant in your own Azure subscription, in the region you
          choose, with your model endpoint, so alert data stays inside your boundary. Assay trains no models on your data. Production data waits for a signed data processing agreement.
        </>
      ),
    },
    {
      q: "Are pilots free?",
      a: (
        <>
          Yes. A design-partner pilot is free for its whole length: shadow mode on 30 days of your historical alerts, in your own Azure tenant, measured against your own dispositions, while your
          analysts work exactly as they do today. <Link href="/pilot">Apply for one of three slots.</Link>
        </>
      ),
    },
    {
      q: "Can we cancel at any time?",
      a: (
        <>
          Yes, from the billing portal. The plan runs to the end of the period you paid for, then the workspace returns to {PLANS.sandbox.name}. Your audit log stays exportable.
        </>
      ),
    },
    {
      q: "Why per run and not per seat?",
      a: (
        <>
          Alert volume is how your team already measures its workload, so the bill moves with the work the agent does. Seats are included rather than billed one by one:{" "}
          {PLANS.sandbox.seats} on {PLANS.sandbox.name}, {team.seats} on {team.name}. At the {team.name} rate the included runs cost {money2(includedEach)} each, against about {money2(LABOR_PER_ALERT)} of modeled
          L1 labor per alert <span className="c-modeled">Modeled</span>.
        </>
      ),
    },
    {
      q: "What changes at L3, auto-close?",
      a: (
        <>
          The price does not. An auto-closed alert is a run like any other and gets its own audit entry. What changes is the bar: an alert type reaches L3 only after {Math.round(L3_MIN_AGREEMENT * 100)}% QA
          agreement on {L3_MIN_QA.toLocaleString("en-US")} reviewed alerts and written sign-off, and only closes at {DEFAULT_POLICY.autoCloseConfidenceFloor.toFixed(2)} confidence or more qualify. Today the
          sign-off is an owner or admin attestation, not an automatic check against the QA data. Nothing starts at L3.
        </>
      ),
    },
  ];

  return (
    <div className="m-pricing">
      <header className="ph ph--navy m-ph">
        <Guilloche className="ph__rosette" size={620} />
        <div className="wrap">
          <p className="kicker">Pricing</p>
          <h1>Priced per alert worked. Published, so you can model it before a call.</h1>
          <p className="ph__lede">
            One price per triage run. {PLANS.sandbox.name} is free on test data. {team.name} is {usd0(team.priceMonthlyUsd ?? 0)} a month with {(team.includedRuns ?? 0).toLocaleString("en-US")} runs
            included. These are early prices, and the first design partners will help set them.
          </p>
        </div>
      </header>

      <section className="sec m-calc-sec" aria-labelledby="calc-h">
        <div className="wrap">
          <div className="sec-head">
            <h2 id="calc-h">Your monthly bill, from your own numbers.</h2>
            <p>
              Move the sliders. The calculator picks the plan that fits. Above {team.seats} analysts or {ENTERPRISE_RUNS.toLocaleString("en-US")} runs a month it hands you to Enterprise, which is priced by
              contract.
            </p>
          </div>
          <UsageCalculator signUpHref={SIGN_UP_HREF} />
        </div>
      </section>

      <section className="sec sec--sheet m-plans-sec" aria-labelledby="plans-h">
        <div className="wrap">
          <div className="sec-head">
            <h2 id="plans-h">Three plans. Start free, pilot free.</h2>
          </div>
          <div className="price-grid">
            {PLAN_IDS.map((id) => {
              const p = PLANS[id];
              const line = priceLine(id);
              return (
                <section key={id} className={`price-col${id === "team" ? " price-col--featured" : ""}`} aria-labelledby={`plan-${id}`}>
                  <h3 id={`plan-${id}`}>{p.name}</h3>
                  <p className="price-col__price num">
                    {line.price}
                    {line.per && <small> {line.per}</small>}
                  </p>
                  <p className="price-col__meter">{line.meter}</p>
                  <p>{p.summary}</p>
                  <ul className="checks">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {id === "sandbox" && (
                    <Link className="btn btn-outline" href={SIGN_UP_HREF} data-track="plan_sandbox">
                      Create a free workspace
                    </Link>
                  )}
                  {id === "team" && (
                    <Link className="btn" href="/pilot" data-track="plan_team">
                      Start with a free pilot
                    </Link>
                  )}
                  {id === "enterprise" && (
                    <Link className="btn btn-outline" href="/pilot" data-track="plan_enterprise">
                      Talk to us
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
          <p className="m-lookback">
            <b>{LOOKBACK_OFFER.name}.</b> {LOOKBACK_OFFER.summary}
          </p>
        </div>
      </section>

      <section className="sec m-faq-sec" aria-labelledby="faq-h">
        <div className="wrap split split--wide split--top">
          <div>
            <h2 id="faq-h">Questions buyers ask first.</h2>
            <p className="split__lede">
              Something missing? Email <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>. I answer pricing questions myself.
            </p>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div>
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <Guilloche className="cta__rosette" size={640} />
        <div className="wrap">
          <h2>Measure it on your own alerts before you pay for it.</h2>
          <p>A shadow-mode pilot runs on 30 days of your history, free, and reports agreement by alert type against your own dispositions.</p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/pilot" data-track="pricing_cta_pilot">
              Become a design partner
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/demo" data-track="pricing_cta_demo">
              Try the live demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
