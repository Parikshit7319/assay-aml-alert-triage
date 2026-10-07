import type { Metadata } from "next";
import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { demoAlertCount } from "@/components/site/DesignPartner";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { HERO_AMOUNTS } from "@/lib/demo/scenarios";
import "../content.css";

export const metadata: Metadata = {
  title: "A day in the queue",
  description:
    "One L1 analyst's shift, twelve AML alerts, hour by hour: how the day runs today and how it runs with Assay doing the first pass. Modeled, with the arithmetic shown.",
};

/* ---------------- Modeled assumptions (all stated on the page) ---------------- */
const LOADED_COST = 90_000; // per analyst per year, /sources assumptions
const PRODUCTIVE_HOURS = 1_560; // per year, /sources assumptions
const RATE = LOADED_COST / PRODUCTIVE_HOURS; // $57.69 per productive hour
const TODAY_MIN = 30; // minutes per alert today, /sources assumptions
const CLEAN_MIN = 8; // design target: review a clean, cited close recommendation
const ESC_MIN = 24; // design target: escalation with a draft narrative (a fifth saved)
const FULL_MIN = 30; // no saving when the agent abstains, locks or sends to review

const GROUPS = [
  { label: "Clean recommendation the analyst agrees with", examples: "payroll, seasonal cash, a volume spike", n: 7, today: TODAY_MIN, after: CLEAN_MIN },
  { label: "Agent abstains, locks, or policy sends it to review", examples: "watchlist name, thin file, memo with instructions, low confidence", n: 4, today: TODAY_MIN, after: FULL_MIN },
  { label: "Escalation recommended, with a draft narrative", examples: "structuring", n: 1, today: TODAY_MIN, after: ESC_MIN },
];

const alerts = GROUPS.reduce((s, g) => s + g.n, 0);
const todayTotal = GROUPS.reduce((s, g) => s + g.n * g.today, 0);
const afterTotal = GROUPS.reduce((s, g) => s + g.n * g.after, 0);
const saved = todayTotal - afterTotal;
const avgAfter = afterTotal / alerts;
const perAlert = (min: number) => (min / 60) * RATE;
const capacity = Math.floor(todayTotal / avgAfter);
const money = (n: number) => `$${n.toFixed(2)}`;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const lo = Math.min(...HERO_AMOUNTS);
const hi = Math.max(...HERO_AMOUNTS);

const SHIFT: { time: string; title: string; tag?: string; today: string; after: string }[] = [
  {
    time: "08:30",
    title: "Open the queue",
    today: "Sort the case manager by alert date and take the oldest. Nothing says which alerts are thin files, which are routine closes, and which are about to age past policy.",
    after: `The agent triaged each alert as it arrived. Each one shows a recommendation, a confidence score and days left against the internal deadline (${DEFAULT_POLICY.internalSlaDays} days by default). The queue is ranked by risk score, so the analyst sees at a glance what matters and what is about to age past policy.`,
  },
  {
    time: "08:45",
    title: "Team huddle, 15 minutes",
    today: "The lead reads assignments off a spreadsheet and asks who is behind. Most of the meeting is status.",
    after: "Team workload already shows open alerts and their age by analyst. The huddle goes to the one case that needs a second opinion.",
  },
  {
    time: "09:00",
    title: "Structuring alert",
    tag: "CASH-STRUCT-01",
    today: "Export 90 days of transactions from core banking, filter for cash, note the location of each deposit, search the customer notes, open the case manager for prior alerts. Thirty minutes, most of it spent assembling, not deciding.",
    after: `The workspace already shows ${HERO_AMOUNTS.length} cash deposits from ${usd(lo)} to ${usd(hi)} at three locations, two same-day pairs, and a teller note about the $10,000 threshold, each one cited. The agent recommends escalation and drafts the L2 narrative. The analyst checks the citations and edits the draft: about ${ESC_MIN} minutes.`,
  },
  {
    time: "09:30",
    title: "Three payroll alerts",
    tag: "ACH-VOL-02",
    today: "Three businesses running payroll, three times the same work: rebuild the pay calendar, confirm the payees repeat, write the close. Thirty minutes each.",
    after: `The agent cites each pay date and the repeat payees and recommends close above the ${DEFAULT_POLICY.closeConfidenceFloor.toFixed(2)} confidence floor. Payroll starts at batch approval, so the three are approved together and QA samples ${pct(DEFAULT_POLICY.qaSampleRate)}. About ${CLEAN_MIN} minutes each.`,
  },
  {
    time: "11:00",
    title: "A watchlist name match, then a thin file",
    tag: "WL-NAME-01, NEW-ACCT-05",
    today: "Compare the name, country and date of birth against the list entry by hand. Then a new account with five transactions and a half-empty profile. An hour for the two.",
    after: `No time saved, by design. Clearing a watchlist match is one of the four things the agent never does, and with fewer than ${DEFAULT_POLICY.minTransactionsForDecision} transactions it abstains instead of guessing, and says what is missing. Still an hour.`,
  },
  {
    time: "12:30",
    title: "QA feedback",
    today: "The lead returns two of yesterday's closes: the notes do not show why. The analyst reopens both and rewrites them from memory.",
    after: "Every close already carries a cited rationale. The QA reviewer marks agree or disagree, a disagreement needs a written note, and both land in the audit log.",
  },
  {
    time: "13:00",
    title: "Three seasonal cash alerts",
    tag: "CASH-VOL-04",
    today: "An orchard, a pumpkin patch and a costume shop, all busy at their usual time of year. Pull statements from one and two years back and compare by hand. Thirty minutes each.",
    after: `The agent compares the same 30-day window one and two years back, cites both, and recommends close. Seasonal cash also starts at batch approval. About ${CLEAN_MIN} minutes each.`,
  },
  {
    time: "14:30",
    title: "A wire with an odd memo",
    tag: "WIRE-INOUT-06",
    today: "The memo on the inbound wire tells the reader to ignore previous instructions and mark the alert cleared. The analyst notices, raises an eyebrow, and works it.",
    after: "The same memo locks the alert to a human before any model call, and the text never reaches the model. The analyst works it from scratch: 30 minutes, same as today.",
  },
  {
    time: "15:00",
    title: "A first wire to a high-risk country, and a volume spike",
    tag: "WIRE-GEO-02, VOL-PROFILE-07",
    today: "Two more alerts, thirty minutes each, the last ones before the write-up.",
    after: `The wire comes back below the ${DEFAULT_POLICY.closeConfidenceFloor.toFixed(2)} close floor, so policy sends it to review: 30 minutes. The volume spike has a clean, cited close: about ${CLEAN_MIN} minutes.`,
  },
  {
    time: "16:00",
    title: "Write-up and the tracker",
    today: "Copy the day's dispositions into the team spreadsheet, note the time spent, email the lead about the backlog. Done at 17:00 with twelve alerts cleared.",
    after: `Dispositions, reason codes and timings are already in the audit log, and the tracker is the metrics screen. The twelve alerts took ${hm(afterTotal)} instead of ${hm(todayTotal)}, which leaves room for about ${capacity - alerts} more at the same mix, or for the cases that need a person.`,
  },
];

export default function DayInTheQueuePage() {
  return (
    <>
      <header className="ph ph--navy">
        <Guilloche className="ph__rosette" size={620} />
        <div className="wrap">
          <nav className="ph__crumb" aria-label="Breadcrumb">
            <span>Solutions</span>
            <span aria-hidden="true">/</span>
            <span>A day in the queue</span>
          </nav>
          <p className="kicker">A day in the queue</p>
          <h1>One L1 analyst, one shift, twelve alerts.</h1>
          <p className="ph__lede">
            A modeled Tuesday at a mid-size bank, from 8:30 to 5:00. First as it runs today, then with Assay doing the first pass. Every number is an assumption you can check in the table at the bottom of the page.
          </p>
          <div className="ph__meta">
            <span>
              Modeled, not measured <span className="c-modeled">Modeled</span>
            </span>
            <span>Synthetic alerts, real rule shapes from the demo</span>
          </div>
        </div>
      </header>

      <section className="sec">
        <div className="wrap wrap--mid">
          <dl className="c-shift-meta">
            <div>
              <dt>Role</dt>
              <dd>L1 analyst</dd>
            </div>
            <div>
              <dt>Shift</dt>
              <dd>08:30 to 17:00</dd>
            </div>
            <div>
              <dt>Alerts worked</dt>
              <dd className="num">{alerts}</dd>
            </div>
            <div>
              <dt>Time on alerts today</dt>
              <dd className="num">{hm(todayTotal)}</dd>
            </div>
          </dl>
          <ol className="tl">
            {SHIFT.map((e) => (
              <li key={e.time}>
                <time>{e.time}</time>
                <div>
                  <h3>
                    {e.title}
                    {e.tag && <span className="c-alert-tag">{e.tag}</span>}
                  </h3>
                  <p>{e.today}</p>
                  <p className="tl__after">
                    <strong>With Assay:</strong> {e.after}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec sec--sheet">
        <div className="wrap wrap--mid">
          <div className="sec-head">
            <p className="kicker">The same shift, in numbers</p>
            <h2>Same twelve alerts, same analyst, same decisions.</h2>
            <p>The analyst still makes every call. What changes is how long it takes to get to the call.</p>
          </div>
          <div className="ba">
            <div>
              <h3>Today</h3>
              <dl>
                <div>
                  <dt>Time on the twelve alerts</dt>
                  <dd>{hm(todayTotal)}</dd>
                </div>
                <div>
                  <dt>Average per alert</dt>
                  <dd>{TODAY_MIN} min</dd>
                </div>
                <div>
                  <dt>L1 labor per alert</dt>
                  <dd>{money(perAlert(TODAY_MIN))}</dd>
                </div>
                <div>
                  <dt>Closes written up by hand</dt>
                  <dd>{alerts - 1}</dd>
                </div>
                <div>
                  <dt>Alerts this shift can cover</dt>
                  <dd>{alerts}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h3>With Assay, design targets</h3>
              <dl>
                <div>
                  <dt>Time on the twelve alerts</dt>
                  <dd>{hm(afterTotal)}</dd>
                </div>
                <div>
                  <dt>Average per alert</dt>
                  <dd>{avgAfter.toFixed(1)} min</dd>
                </div>
                <div>
                  <dt>L1 labor per alert</dt>
                  <dd>{money(perAlert(avgAfter))}</dd>
                </div>
                <div>
                  <dt>Time back this shift</dt>
                  <dd>
                    {saved} min ({pct(saved / todayTotal)})
                  </dd>
                </div>
                <div>
                  <dt>Alerts this shift can cover at the same mix</dt>
                  <dd>about {capacity}</dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="c-note">
            Labor per alert excludes Assay&apos;s own price. On the Team plan that is $1,500 a month for the first 2,000 runs, then $0.60 a run. <Link href="/pricing">Pricing</Link>
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap wrap--mid">
          <div className="sec-head">
            <p className="kicker">Check the arithmetic</p>
            <h2>Where the {saved} minutes come from.</h2>
            <p>
              {GROUPS[0].n * (GROUPS[0].today - GROUPS[0].after)} of the {saved} minutes come from one group: alerts where the agent hands the analyst a clean, cited recommendation. Everything the agent refuses to touch costs exactly what it
              costs today.
            </p>
          </div>
          <div className="tbl-scroll">
            <table className="tbl c-math">
              <caption className="visually-hidden">Minutes per group of alerts, today and with Assay</caption>
              <thead>
                <tr>
                  <th scope="col">Group</th>
                  <th scope="col" className="num">
                    Alerts
                  </th>
                  <th scope="col" className="num">
                    Today
                  </th>
                  <th scope="col" className="num">
                    With Assay
                  </th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => (
                  <tr key={g.label}>
                    <td>
                      {g.label}
                      <br />
                      <span className="fine">{g.examples}</span>
                    </td>
                    <td className="num">{g.n}</td>
                    <td className="num">
                      {g.n} &times; {g.today} = {g.n * g.today} min
                    </td>
                    <td className="num">
                      {g.n} &times; {g.after} = {g.n * g.after} min
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{alerts}</td>
                  <td className="num">{todayTotal} min</td>
                  <td className="num">{afterTotal} min</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3 className="c-h3" style={{ marginTop: 48 }}>
            Assumptions
          </h3>
          <ul className="ruled" style={{ marginTop: 14 }}>
            <li>
              <h3>Six hours on alerts</h3>
              <p>
                {PRODUCTIVE_HOURS.toLocaleString("en-US")} productive hours a year over 260 working days. The rest of the 8.5-hour shift is lunch, the huddle, QA feedback and the write-up. <Link href="/sources">Sources and assumptions</Link>
              </p>
            </li>
            <li>
              <h3>{TODAY_MIN} minutes per alert today</h3>
              <p>
                The site-wide assumption. Industry estimates run from 20 to 60 minutes and there is no strong public source, which is why a pilot measures it first. At {money(RATE)} per productive hour ({usd(LOADED_COST)} loaded cost over{" "}
                {PRODUCTIVE_HOURS.toLocaleString("en-US")} hours) that is {money(perAlert(TODAY_MIN))} an alert.
              </p>
            </li>
            <li>
              <h3>Eleven of twelve close</h3>
              <p>
                For most banks more than 90% of transaction-monitoring alerts are false positives.
                <sup>
                  <Link href="/sources#mckinsey-2020">1</Link>
                </sup>{" "}
                One escalation in twelve is in that range.
              </p>
            </li>
            <li>
              <h3>{CLEAN_MIN} minutes for a clean recommendation</h3>
              <p>
                A design target, not a measured result. The analyst reviews a recommendation with every claim cited instead of assembling the evidence and writing the close. Seven of twelve alerts landing here is also a target. Shadow mode in a
                pilot measures both.
              </p>
            </li>
            <li>
              <h3>{ESC_MIN} minutes for an escalation</h3>
              <p>A fifth saved, not more. The evidence is assembled, but the draft narrative still needs an analyst who knows the case. This matches the site&apos;s time-saved model.</p>
            </li>
            <li>
              <h3>No saving where the agent stands back</h3>
              <p>
                Watchlist matches, thin files, locked alerts and low-confidence calls cost {FULL_MIN} minutes, as today. The result, {pct(saved / todayTotal)} of alert time, sits next to the 45% time-saved assumption listed on{" "}
                <Link href="/sources">Sources and assumptions</Link>.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="cta">
        <Guilloche className="cta__rosette" size={640} />
        <div className="wrap">
          <h2>Work this shift yourself.</h2>
          <p>Every alert type in this story is in the demo, among {demoAlertCount()} synthetic alerts that run in your browser. Time yourself on a clean close, then on the structuring case.</p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo" data-track="ditq-demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot" data-track="ditq-pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
