"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { PLANS } from "@/lib/plans";
import { ENTERPRISE_RUNS, L1_MINUTES, LABOR_PER_ALERT, LABOR_PER_ALERT_AFTER, money2, pct, PRODUCTIVE_HOURS, TIME_SAVED_SHARE } from "./marketing-numbers";
import "@/app/(site)/content.css";
import "./marketing.css";

/** Alert volumes on the slider: roughly logarithmic from 100 to 50,000 a month. */
const VOLUMES = [100, 150, 250, 400, 600, 800, 1_000, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000, 6_000, 7_500, 10_000, 12_500, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000];

type Model = "rules" | "live";
type Quote =
  | { plan: "sandbox"; why: string; total: 0 }
  | { plan: "team"; why: string; base: number; included: number; overRuns: number; over: number; total: number }
  | { plan: "enterprise"; why: string };

const n0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const money0 = (n: number) => `$${n0(Math.round(n))}`;

function quote(runs: number, seats: number, model: Model): Quote {
  const sb = PLANS.sandbox;
  const tm = PLANS.team;
  const sbRuns = sb.includedRuns ?? 0;
  const sbSeats = sb.seats ?? 0;
  const tmSeats = tm.seats ?? 0;
  if (runs <= sbRuns && model === "rules" && seats <= sbSeats) {
    return { plan: "sandbox", total: 0, why: `Fits ${sb.name}: up to ${n0(sbRuns)} runs a month on the rules model, ${sbSeats} seats.` };
  }
  if (seats > tmSeats) return { plan: "enterprise", why: `More than ${tmSeats} analysts is Enterprise, priced by contract.` };
  if (runs > ENTERPRISE_RUNS) return { plan: "enterprise", why: `Above ${n0(ENTERPRISE_RUNS)} runs a month, Enterprise is priced by contract volume.` };
  const reasons = [model === "live" ? "the live model" : null, runs > sbRuns ? `more than ${n0(sbRuns)} runs` : null, seats > sbSeats ? `more than ${sbSeats} seats` : null].filter(Boolean);
  const base = tm.priceMonthlyUsd ?? 0;
  const included = tm.includedRuns ?? 0;
  const overRuns = Math.max(0, runs - included);
  const over = overRuns * (tm.overagePerRunUsd ?? 0);
  const list = reasons.length > 1 ? `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}` : reasons[0];
  return { plan: "team", base, included, overRuns, over, total: base + over, why: `${tm.name}, for ${list}. Up to ${tmSeats} seats.` };
}

/**
 * Pricing calculator: alert volume, analysts and model choice in, the plan that
 * fits and the monthly bill out, with a modeled labor comparison. Only the total
 * is announced to screen readers when it changes.
 */
export function UsageCalculator({ signUpHref, contactHref = "/pilot" }: { signUpHref: string; contactHref?: string }) {
  const id = useId();
  const [vi, setVi] = useState(VOLUMES.indexOf(4_000));
  const [seats, setSeats] = useState(8);
  const [model, setModel] = useState<Model>("live");
  const runs = VOLUMES[vi];
  const q = quote(runs, seats, model);
  const capacity = Math.round(((PRODUCTIVE_HOURS / 12) * 60 * seats) / L1_MINUTES);
  const laborNow = runs * LABOR_PER_ALERT;
  const laborBack = runs * (LABOR_PER_ALERT - LABOR_PER_ALERT_AFTER);
  const planName = q.plan === "sandbox" ? PLANS.sandbox.name : q.plan === "team" ? PLANS.team.name : PLANS.enterprise.name;

  return (
    <div className="usage m-usage">
      <div className="usage__inputs">
        <div className="usage__field">
          <label htmlFor={`${id}-runs`}>
            Alerts per month
            <output htmlFor={`${id}-runs`} className="num">
              {n0(runs)}
            </output>
          </label>
          <input
            id={`${id}-runs`}
            type="range"
            min={0}
            max={VOLUMES.length - 1}
            step={1}
            value={vi}
            aria-valuetext={`${n0(runs)} alerts a month`}
            onChange={(e) => setVi(Number(e.target.value))}
          />
          <small>Each alert the agent works is one run, whatever the outcome.</small>
        </div>

        <div className="usage__field">
          <label htmlFor={`${id}-seats`}>
            L1 analysts
            <output htmlFor={`${id}-seats`} className="num">
              {seats}
            </output>
          </label>
          <input
            id={`${id}-seats`}
            type="range"
            min={1}
            max={50}
            step={1}
            value={seats}
            aria-valuetext={`${seats} analyst${seats === 1 ? "" : "s"}`}
            onChange={(e) => setSeats(Number(e.target.value))}
          />
          <small>
            At {L1_MINUTES} minutes an alert, {seats} analyst{seats === 1 ? "" : "s"} can work about {n0(capacity)} alerts a month. <span className="c-modeled">Modeled</span>
          </small>
        </div>

        <div className="usage__field" role="group" aria-labelledby={`${id}-model`}>
          <span className="m-usage__label" id={`${id}-model`}>
            Model
          </span>
          <div className="usage__seg">
            <button type="button" aria-pressed={model === "rules"} onClick={() => setModel("rules")}>
              Rules model
            </button>
            <button type="button" aria-pressed={model === "live"} onClick={() => setModel("live")}>
              Live model
            </button>
          </div>
          <small>
            {model === "live"
              ? "Anthropic, OpenAI or Azure OpenAI. Cited claims written by a language model, checked by the same rules."
              : "The deterministic rules model from the demo. Same evidence, same checks, no language model."}
          </small>
        </div>
      </div>

      <div className="usage__bill">
        <h3>Estimated monthly bill</h3>
        <span className="usage__plan">{planName} plan</span>
        <p className="usage__total" aria-live="polite" aria-atomic="true">
          {q.plan === "enterprise" ? (
            <>
              Custom<span className="visually-hidden">, {planName} plan</span>
            </>
          ) : (
            <>
              {money2(q.total)}
              <small> / month</small>
              <span className="visually-hidden">, {planName} plan</span>
            </>
          )}
        </p>
        <p className="m-usage__why">{q.why}</p>

        {q.plan === "team" && (
          <dl className="usage__lines">
            <div>
              <dt>Base, includes {n0(q.included)} runs</dt>
              <dd>{money2(q.base)}</dd>
            </div>
            <div>
              <dt>
                {n0(q.overRuns)} more run{q.overRuns === 1 ? "" : "s"} &times; {money2(PLANS.team.overagePerRunUsd ?? 0)}
              </dt>
              <dd>{money2(q.over)}</dd>
            </div>
            <div className="m-usage__sum">
              <dt>Total</dt>
              <dd>{money2(q.total)}</dd>
            </div>
            <div>
              <dt>Effective price per alert</dt>
              <dd>{money2(q.total / runs)}</dd>
            </div>
          </dl>
        )}
        {q.plan === "sandbox" && (
          <dl className="usage__lines">
            <div>
              <dt>Runs included</dt>
              <dd>{n0(PLANS.sandbox.includedRuns ?? 0)}</dd>
            </div>
            <div className="m-usage__sum">
              <dt>Total</dt>
              <dd>{money2(0)}</dd>
            </div>
          </dl>
        )}
        {q.plan === "enterprise" && (
          <ul className="m-usage__ent">
            <li>Single-tenant in your Azure subscription</li>
            <li>Your model endpoint and data residency</li>
            <li>Volume set by contract</li>
          </ul>
        )}

        {q.plan === "sandbox" ? (
          <Link className="btn btn-light" href={signUpHref} data-track="calc_sandbox">
            Create a free workspace
          </Link>
        ) : q.plan === "team" ? (
          <Link className="btn btn-light" href={contactHref} data-track="calc_team">
            Start with a free pilot
          </Link>
        ) : (
          <Link className="btn btn-light" href={contactHref} data-track="calc_enterprise">
            Talk to us
          </Link>
        )}

        <div className="usage__roi">
          <p>
            <span className="c-modeled">Modeled</span> Analyst time this could give back: <strong className="num">{money0(laborBack)}</strong> a month.
          </p>
          <p className="m-usage__math num">
            {n0(runs)} alerts &times; {money2(LABOR_PER_ALERT)} of L1 labor &times; {pct(TIME_SAVED_SHARE)} time saved, out of about {money0(laborNow)} a month today.
          </p>
          <p className="m-usage__math">
            The {pct(TIME_SAVED_SHARE)} is the twelve-alert shift modeled on <Link href="/day-in-the-queue">A day in the queue</Link>. A pilot measures your real number. Freed time is capacity, not a headcount cut.
          </p>
        </div>
      </div>
    </div>
  );
}
