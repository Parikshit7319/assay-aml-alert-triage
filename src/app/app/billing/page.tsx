import { BillingButtons } from "@/components/app/BillingButtons";
import { stripeConfigured } from "@/lib/billing/stripe";
import { usageForPeriod } from "@/lib/metering";
import { DEMO_RUN_LIMIT, PLANS } from "@/lib/plans";
import { canAdminister, requireTenant } from "@/lib/tenant";

export default async function BillingPage(props: PageProps<"/app/billing">) {
  const t = await requireTenant();
  const sp = await props.searchParams;
  const u = await usageForPeriod(t.db, t.ws);
  const plan = PLANS[t.ws.plan];
  const included = t.mode === "demo" ? DEMO_RUN_LIMIT : plan.includedRuns;
  const revenue = (plan.priceMonthlyUsd ?? 0) + u.overageUsd;
  const modelCost = u.costMicros / 1_000_000;
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Plan and usage</h1>
          <p>One triage run is one alert worked by the agent. Runs are metered as they happen.</p>
        </div>
      </div>
      {sp.checkout === "success" && <p className="form-ok toast">Payment received. The Team plan activates as soon as Stripe confirms the subscription, usually within a minute.</p>}
      {sp.checkout === "cancelled" && <p className="form-error toast">Checkout was cancelled. Nothing was charged.</p>}
      <div className="metric-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>{t.mode === "demo" ? "Demo workspace" : `${plan.name} plan`}</h2>
            <span>{u.period}</span>
          </div>
          <ul className="guard">
            <li>
              Triage runs this month
              <b className="num">
                {u.runs.toLocaleString()}
                {included != null ? ` of ${included.toLocaleString()}` : ""}
              </b>
            </li>
            {plan.overagePerRunUsd != null && (
              <li>
                Runs over the included amount
                <b className="num">
                  {u.overageRuns.toLocaleString()} at ${plan.overagePerRunUsd.toFixed(2)}
                </b>
              </li>
            )}
            <li>
              Tokens
              <b className="num">
                {u.inputTokens.toLocaleString()} in, {u.outputTokens.toLocaleString()} out
              </b>
            </li>
            <li>
              Model cost
              <b className="num">${modelCost.toFixed(2)}</b>
              <small>Average ${u.avgCostPerRunUsd.toFixed(4)} per run. Simulated runs are priced at Claude Sonnet 5.5 list rates to show what a live model would cost.</small>
            </li>
            {t.mode !== "demo" && plan.priceMonthlyUsd != null && (
              <li>
                This month&apos;s bill so far
                <b className="num">${revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
                <small>Gross margin on model cost: {revenue ? `${(((revenue - modelCost) / revenue) * 100).toFixed(1)}%` : "n/a on Sandbox"}</small>
              </li>
            )}
          </ul>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>Change plan</h2>
          </div>
          <div className="panel__body form-stack">
            {(["sandbox", "team", "enterprise"] as const).map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--rule)" }}>
                  <b>
                    {p.name}
                    {t.ws.plan === id && t.mode !== "demo" ? " (current)" : ""}
                  </b>
                  <p className="decide__hint">
                    {p.priceMonthlyUsd == null ? "Custom pricing" : p.priceMonthlyUsd === 0 ? "Free" : `$${p.priceMonthlyUsd.toLocaleString()} a month`}. {p.summary}
                  </p>
                </div>
              );
            })}
            <BillingButtons
              demo={t.mode === "demo"}
              configured={stripeConfigured()}
              canManage={canAdminister(t)}
              plan={t.ws.plan}
              hasCustomer={!!t.ws.stripeCustomerId}
            />
          </div>
        </section>
      </div>
    </>
  );
}
