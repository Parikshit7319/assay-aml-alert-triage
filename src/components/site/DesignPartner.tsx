import { PilotDemand } from "./PilotDemand";
import Link from "next/link";
import { buildScenarios } from "@/lib/demo/scenarios";
import { NEVER_AUTOMATED } from "@/lib/engine/policy";
import { TYPOLOGIES } from "@/lib/labels";
import { prng } from "@/lib/util";
import "@/app/(site)/content.css";

/*
 * Pre-model and post-model rules in src/lib/engine/policy.ts: P1 untrusted
 * text, P2 watchlist similarity, P3 thin file, P4 failed validation, P5 close
 * below the confidence floor, P6 unverified dollar figure. The rule strings are
 * inline in that file, so the count lives here. Update both together.
 */
const POLICY_RULE_COUNT = 6;

const SLOTS = 3;

/** Counts the demo alerts the same way the demo builds them: open queue plus the recently closed set used to seed QA. */
export function demoAlertCount(): number {
  const { open, recentlyClosed } = buildScenarios(prng(1), new Date("2026-01-05T15:00:00Z"));
  return open.length + recentlyClosed.length;
}

/**
 * Honest social proof: real counts of the product itself, plus the design
 * partner program. Shows demand only when there is some worth stating.
 */
export function DesignPartner({ pilotRequests, id = "design-partners" }: { pilotRequests?: number; id?: string }) {
  const counts = [
    { n: demoAlertCount(), label: "synthetic alerts in the public demo, each one built to test a specific rule or edge case" },
    { n: TYPOLOGIES.length, label: "alert typologies with their own autonomy setting, from structuring to payroll" },
    { n: POLICY_RULE_COUNT, label: "deterministic policy rules that run before and after the model on every alert" },
    { n: NEVER_AUTOMATED.length, label: "actions the agent has no code path to take, starting with the SAR decision" },
  ];
  const demand = typeof pilotRequests === "number" && pilotRequests >= 3 ? pilotRequests : null;

  return (
    <section className="sec sec--sheet" id={id} aria-labelledby={`${id}-h`}>
      <div className="wrap">
        <div className="sec-head">
          <p className="kicker">Design partner program</p>
          <h2 id={`${id}-h`}>No customers yet. Three design partner slots.</h2>
          <p>
            Assay is working software running on synthetic data. Nobody has put production alerts through it. The proof available today is the product itself, counted
            from its code, and a pilot designed so you can measure it on your own dispositions before trusting it with one.
          </p>
        </div>
        <div className="partner">
          <div>
            <h3 className="c-h3">What exists today</h3>
            <dl className="c-dp__counts">
              {counts.map((c) => (
                <div key={c.label}>
                  <dt>{c.label}</dt>
                  <dd className="partner__count num">{c.n}</dd>
                </div>
              ))}
            </dl>
            <ul className="c-dp__slots" aria-label={`${SLOTS} design partner slots`}>
              {Array.from({ length: SLOTS }, (_, i) => (
                <li key={i}>
                  <b>Slot {i + 1}</b>
                  Open
                </li>
              ))}
            </ul>
            <PilotDemand initial={demand} fallback={<p className="c-note">Three is a goal for the first pilots, not a waitlist.</p>} />
          </div>
          <div className="c-dp__program">
            <h3 className="c-h3">Who it is for</h3>
            <p>US banks and credit unions, fintech sponsor banks, and money services businesses with 2 to 25 L1 analysts working transaction-monitoring alerts.</p>
            <h3 className="c-h3">What you get</h3>
            <ul className="checks">
              <li>A shadow-mode pilot on your historical alerts. The agent runs, your analysts never see it, and you get agreement by alert type against your own dispositions.</li>
              <li>It runs in your own Azure tenant with your own model endpoint, so alert data stays inside your boundary.</li>
              <li>Free for the length of the pilot.</li>
              <li>A direct line to me, the founder, for the whole pilot.</li>
              <li>Real influence on the roadmap: integrations, typologies and the model risk pack get built in the order partners need them.</li>
            </ul>
            <h3 className="c-h3">What I ask</h3>
            <ol>
              <li>30 days of historical alerts with their final dispositions.</li>
              <li>Two 30-minute feedback sessions with whoever owns the queue.</li>
              <li>Permission to publish the results, anonymized.</li>
            </ol>
            <div className="actions">
              <Link className="btn btn-lg" href="/pilot" data-track="design-partner-apply">
                Become a design partner
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
