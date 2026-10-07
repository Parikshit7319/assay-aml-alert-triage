import type { Metadata } from "next";
import { OG_IMAGES } from "@/lib/og";
import Link from "next/link";
import { Guilloche } from "@/components/Guilloche";
import { demoAlertCount } from "@/components/site/DesignPartner";
import { Frame } from "@/components/site/Frame";
import { buildHeroRuns } from "@/components/site/hero-run-data";
import { StoryNav, type StoryItem } from "@/components/site/StoryNav";
import { Icon } from "@/components/viz/Icon";
import { brand } from "@/lib/brand";
import type { RationaleItem } from "@/lib/db/schema";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { buildScenarios, Ctx, heroStructuring, WATCHLIST } from "@/lib/demo/scenarios";
import { runTriage } from "@/lib/engine/pipeline";
import { AUTONOMY_LEVELS, DEFAULT_POLICY, NEVER_AUTOMATED, postPolicy } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { validateRationale } from "@/lib/engine/validate";
import { CSV_COLUMNS, inferTypology, MAX_CSV_ALERTS, REQUIRED_CSV_COLUMNS } from "@/lib/import-schema";
import { OVERRIDE_REASONS, TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { prng } from "@/lib/util";
import "@/app/(site)/content.css";
import "@/components/site/marketing.css";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "What Assay does with one AML alert, in order: intake, evidence, rules before the model, the model and its limits, checks on every claim, the analyst's decision, and the record an examiner asks for.",
  openGraph: { images: OG_IMAGES,
    title: `How ${brand.name} works an AML alert, step by step`,
    description: "Seven steps from rule hit to decision. Plain code gathers and checks, the model drafts, a person decides.",
    type: "website",
  },
};

/* Rule codes P1 to P6 in src/lib/engine/policy.ts. Same count as the design partner block. */
const POLICY_RULES = 6;
/*
 * Keyboard shortcuts in the analyst workbench. Set to false if the workbench
 * build you are shipping does not have them.
 */
const SHOW_SHORTCUTS = true;

const CHAPTERS: StoryItem[] = [
  { id: "intake", n: "01", label: "Intake" },
  { id: "evidence", n: "02", label: "Evidence" },
  { id: "before", n: "03", label: "Rules before the model" },
  { id: "model", n: "04", label: "The model and its limits" },
  { id: "checks", n: "05", label: "Checking the model" },
  { id: "decide", n: "06", label: "The analyst decides" },
  { id: "record", n: "07", label: "The record for examiners" },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Average token use and modeled cost across the demo's alerts that reach the model. */
async function modelCost() {
  const { open, recentlyClosed, watchlist } = buildScenarios(prng(1), new Date("2026-01-05T15:00:00Z"));
  const provider = new SimulatedProvider();
  let runs = 0;
  let inTok = 0;
  let outTok = 0;
  let micros = 0;
  for (const s of [...open, ...recentlyClosed]) {
    const r = await runTriage(scenarioToBundle(s, watchlist, "ALT-COST"), DEFAULT_POLICY, provider);
    if (!r.inputTokens) continue;
    runs++;
    inTok += r.inputTokens;
    outTok += r.outputTokens;
    micros += r.costMicros;
  }
  return { runs, inTok: inTok / runs, outTok: outTok / runs, usd: micros / runs / 1_000_000 };
}

/**
 * A rationale broken on purpose, put through the real validator and post-model
 * policy: one good claim from the engine, one citing a record that does not
 * exist with a figure that does not add up, one with no citation at all.
 */
async function brokenExample() {
  const ctx = new Ctx(prng(7), new Date("2026-10-06T15:00:00Z"));
  const s = heroStructuring(ctx, new Date("2026-10-06T14:00:00Z"));
  const watchlist = WATCHLIST.map((w, i) => ({ ...w, id: `WL-${i}` }));
  const bundle = scenarioToBundle(s, watchlist, "ALT-7Q2M4K");
  const real = await runTriage(bundle, DEFAULT_POLICY, new SimulatedProvider());
  const t1 = bundle.transactions.find((t) => s.alert.triggeredTxnIds.includes(t.id));
  const fake = "TXN-ZZ9ZZ9";
  const claims: RationaleItem[] = [
    real.rationale[0],
    { claim: "Two of the deposits came from a business account, totaling $19,300.", citations: [t1?.id ?? s.alert.triggeredTxnIds[0], fake] },
    { claim: "The customer's rideshare income explains the cash.", citations: [] },
  ];
  const validation = validateRationale(claims, bundle);
  const post = postPolicy({ typology: "structuring", modelRecommendation: "close", confidence: 0.91, validation, preHits: [], settings: DEFAULT_POLICY });
  return {
    rows: claims.map((c) => ({
      claim: c.claim,
      cites: c.citations.map((id) => ({ id, ok: !validation.unknownCitations.includes(id) })),
      figures: validation.amountMismatches.filter((m) => m.claim === c.claim).map((m) => m.amount),
    })),
    validation,
    post,
  };
}

function Ok({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={ok ? "m-check m-check--ok" : "m-check m-check--bad"}>
      <Icon name={ok ? "check" : "x"} size={13} />
      {children}
    </span>
  );
}

export default async function ProductPage() {
  const [hero, cost, broken] = await Promise.all([buildHeroRuns(), modelCost(), brokenExample()]);
  const locked = hero.cases.find((c) => c.outcome === "locked");
  const demoCount = demoAlertCount();
  const ruleCodes = ["CASH-STRUCT-01", "P2P-FUNNEL-03", "WIRE-GEO-02", "WL-NAME-01", "ACH-VOL-02", "CASH-VOL-04", "VOL-PROFILE-07"];
  const startAt = (lvl: number) =>
    TYPOLOGIES.filter((t) => DEFAULT_POLICY.autonomy[t] === lvl)
      .map((t) => TYPOLOGY_LABEL[t])
      .join(", ");

  return (
    <>
      <header className="ph ph--navy m-ph">
        <Guilloche className="ph__rosette" size={620} />
        <div className="wrap">
          <p className="kicker">Product</p>
          <h1>What happens to an alert, from the rule hit to the analyst&apos;s decision.</h1>
          <p className="ph__lede">Seven steps, in the order they run. Plain code gathers the evidence and checks the work. The model writes the first draft. A person makes the call.</p>
          <div className="ph__meta">
            <span>{POLICY_RULES} deterministic policy rules</span>
            <span>{TYPOLOGIES.length} alert types, each with its own autonomy level</span>
            <span>Anthropic, OpenAI, Azure OpenAI, or no model at all</span>
          </div>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo" data-track="product_head_demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/developers" data-track="product_head_api">
              Read the API
            </Link>
          </div>
        </div>
      </header>

      <section className="sec m-story-sec">
        <div className="wrap story">
          <StoryNav items={CHAPTERS} label="Steps on this page" />
          <div className="m-chapters">
            {/* 01 Intake */}
            <article className="chapter" id="intake" aria-labelledby="intake-h">
              <p className="chapter__n">01</p>
              <h2 id="intake-h">Alerts come in the way your system already sends them.</h2>
              <p>
                Post alerts to the REST API as they fire, or upload a CSV export: one row per transaction, {CSV_COLUMNS.length} columns, {REQUIRED_CSV_COLUMNS.length} of them required, up to {MAX_CSV_ALERTS}{" "}
                alerts a file. Your rule codes and transaction IDs stay as they are, so every citation points back to a record you already have. Re-sending an alert ID that is already in the workspace returns a
                duplicate and is not billed.
              </p>
              <pre className="code-block m-code" tabIndex={0} aria-label="Example API request">
                <code>
                  <span className="c"># Send one alert with its customer and transactions</span>
                  {"\n"}curl -X POST https://YOUR-DEPLOYMENT/api/v1/alerts \{"\n"}
                  {"  "}-H <span className="s">&quot;Authorization: Bearer ask_...&quot;</span> \{"\n"}
                  {"  "}-H <span className="s">&quot;Content-Type: application/json&quot;</span> \{"\n"}
                  {"  "}-d <span className="s">&apos;{"{"}</span>
                  {"\n"}
                  {`    "alert": { "external_id": "TM-100231", "rule_code": "CASH-STRUCT-01",
               "triggered_transaction_ids": ["TX-1", "TX-2", "TX-3"] },
    "customer": { "external_id": "CUST-55102", "name": "Sample Customer A",
                  "type": "individual", "expected_monthly_volume": 6000 },
    "transactions": [{ "external_id": "TX-1", "timestamp": "2026-09-24T10:00:00Z",
                       "amount": 9200, "direction": "in", "channel": "cash" }]
  `}
                  <span className="s">{"}'"}</span>
                </code>
              </pre>
              <h3 className="m-subh">Rule codes map to alert types on their own</h3>
              <p className="m-chapter-note">Leave the typology blank and it is inferred from the rule code. These are the demo&apos;s rule codes, run through the same function the importer uses.</p>
              <div className="tbl-scroll">
                <table className="tbl m-map">
                  <thead>
                    <tr>
                      <th scope="col">Your rule code</th>
                      <th scope="col">Alert type in Assay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ruleCodes.map((code) => (
                      <tr key={code}>
                        <td className="m-code-cell">{code}</td>
                        <td>{TYPOLOGY_LABEL[inferTypology(code)]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="m-chapter-link">
                <Link className="arrow-link" href="/developers">
                  Full API reference
                </Link>
              </p>
            </article>

            {/* 02 Evidence */}
            <article className="chapter" id="evidence" aria-labelledby="evidence-h">
              <p className="chapter__n">02</p>
              <h2 id="evidence-h">It pulls what an L1 analyst pulls, every time, in the same order.</h2>
              <p>For each alert the agent gets a fixed evidence bundle and nothing else. Every record in it carries an ID, and the agent may cite only those IDs.</p>
              <dl className="m-defs">
                <div>
                  <dt>Customer profile</dt>
                  <dd>Type, occupation or industry, onboarding date, risk rating, expected monthly volume, and staff notes.</dd>
                </div>
                <div>
                  <dt>Transactions</dt>
                  <dd>The last 90 days, plus up to three years of older history for seasonality and long-running relationships.</dd>
                </div>
                <div>
                  <dt>Prior cases</dt>
                  <dd>Earlier alerts and SARs on the same customer, with their outcomes.</dd>
                </div>
                <div>
                  <dt>Watchlist screen</dt>
                  <dd>The customer and every counterparty against your list. Candidates at 0.80 name similarity and up are kept.</dd>
                </div>
                <div>
                  <dt>Typology checks</dt>
                  <dd>Counts, sums, cadence, pass-through ratios and same-day branch patterns, computed in code before any model sees the case.</dd>
                </div>
              </dl>
              <Frame
                src="/shots/alert.png"
                url="assay / alert"
                width={1440}
                height={900}
                alt="An alert in the Assay workbench: the customer profile, prior cases and watchlist candidates beside the recommendation, cited claims and the investigation trace."
              />
            </article>

            {/* 03 Rules before the model */}
            <article className="chapter" id="before" aria-labelledby="before-h">
              <p className="chapter__n">03</p>
              <h2 id="before-h">Some alerts never reach the model, by design.</h2>
              <p>Three rules run in plain code before any model call. They give the same answer every time, and nothing the model says later can overturn them.</p>
              <ol className="m-rules">
                <li>
                  <span className="m-rules__code">P1</span>
                  <div>
                    <h3>A memo or payee name that reads like an order</h3>
                    <p>Memos and counterparty names are written by customers. If one reads like an instruction to the agent, the alert locks to a person and the text is never sent to a model.</p>
                  </div>
                  <span className="m-rules__effect m-rules__effect--red">Locked to a person</span>
                </li>
                <li>
                  <span className="m-rules__code">P2</span>
                  <div>
                    <h3>Watchlist name similarity of {DEFAULT_POLICY.watchlistForceL2Similarity.toFixed(2)} or more</h3>
                    <p>The alert goes to L2 whatever the model concludes. The agent explains the match; it never clears one.</p>
                  </div>
                  <span className="m-rules__effect m-rules__effect--red">Forced to L2</span>
                </li>
                <li>
                  <span className="m-rules__code">P3</span>
                  <div>
                    <h3>Fewer than {DEFAULT_POLICY.minTransactionsForDecision} transactions, or a thin file</h3>
                    <p>Or under 60% of the data a decision needs, counted from five checks such as occupation, onboarding date and expected volume. The agent abstains and says what is missing instead of guessing.</p>
                  </div>
                  <span className="m-rules__effect">Agent abstains</span>
                </li>
              </ol>
              {locked?.quarantine && (
                <figure className="m-example">
                  <figcaption>
                    From the demo: alert {locked.alertId}, rule {locked.ruleCode}
                  </figcaption>
                  <div className="m-example__body">
                    <p className="m-example__label">
                      {locked.quarantine.field} on {locked.quarantine.id}
                    </p>
                    <blockquote className="m-example__quote">{locked.quarantine.text}</blockquote>
                    <p className="m-example__result">
                      <span className="mark mark-review">
                        <span>
                          <strong>Human review</strong>
                          <small>{locked.policyRules[0]}. Model not called.</small>
                        </span>
                      </span>
                    </p>
                  </div>
                </figure>
              )}
            </article>

            {/* 04 The model */}
            <article className="chapter" id="model" aria-labelledby="model-h">
              <p className="chapter__n">04</p>
              <h2 id="model-h">The model writes the first draft. It does not decide.</h2>
              <p>
                It reads the evidence bundle and the computed findings and returns one structured answer. Text written by customers is tagged as untrusted, and text that policy locked is never sent at all.
              </p>
              <div className="m-two">
                <div>
                  <h3 className="m-subh">What it returns</h3>
                  <ul className="checks">
                    <li>Close or escalate</li>
                    <li>A confidence from 0 to 1 and a risk score from 0 to 100</li>
                    <li>Claims, each with the IDs of the records behind it</li>
                    <li>A draft L2 narrative when it recommends escalation</li>
                  </ul>
                </div>
                <div>
                  <h3 className="m-subh">What it cannot do</h3>
                  <ul className="checks checks--no">
                    <li>Cite a record it was not given</li>
                    <li>See text that policy locked</li>
                    <li>Override a rule that ran before it</li>
                    <li>Close an alert on its own, unless its type has reached L3</li>
                  </ul>
                </div>
              </div>
              <p>
                On Team the model is Anthropic, OpenAI or Azure OpenAI. Enterprise points it at your own Azure OpenAI deployment, so alert data stays inside your subscription. Without a model key, a deterministic rules
                model does the same job with the same checks; that is what the public demo runs, and you can paste your own key there to try a live model from your browser.
              </p>
              <dl className="figures figures--3 m-cost">
                <div>
                  <dt>input tokens on an average demo alert, prompt and evidence together</dt>
                  <dd>{n0(cost.inTok)}</dd>
                </div>
                <div>
                  <dt>output tokens for the recommendation and its cited claims</dt>
                  <dd>{n0(cost.outTok)}</dd>
                </div>
                <div>
                  <dt>
                    model cost per run at Claude Sonnet 5.5 list prices
                    <sup>
                      <Link href="/sources#anthropic-pricing">1</Link>
                    </sup>
                  </dt>
                  <dd>${cost.usd.toFixed(3)}</dd>
                </div>
              </dl>
              <p className="m-chapter-note">
                Averages over the {cost.runs} of {demoCount} demo alerts that reach the model, counted from the real prompt. Locked and thin-file alerts make no model call, so they use no tokens.
              </p>
            </article>

            {/* 05 Checks */}
            <article className="chapter" id="checks" aria-labelledby="checks-h">
              <p className="chapter__n">05</p>
              <h2 id="checks-h">Every claim is checked against the records before anyone sees it.</h2>
              <p>
                Each citation must point to a record in the bundle. Each dollar figure must match a cited transaction, a sum of cited transactions, the expected volume on the profile, or a rule threshold. Below is a
                rationale broken on purpose and run through the real validator.
              </p>
              <figure className="m-validate">
                <div className="tbl-scroll">
                  <table className="tbl m-validate__tbl">
                    <caption className="visually-hidden">Validation result for three claims</caption>
                    <thead>
                      <tr>
                        <th scope="col">Claim</th>
                        <th scope="col">Citations</th>
                        <th scope="col">Dollar figures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {broken.rows.map((r) => (
                        <tr key={r.claim}>
                          <td>{r.claim}</td>
                          <td>
                            {r.cites.length ? (
                              <span className="m-check-list">
                                {r.cites.slice(0, 2).map((c) => (
                                  <Ok key={c.id} ok={c.ok}>
                                    {c.id}
                                    {c.ok ? "" : ", not in the bundle"}
                                  </Ok>
                                ))}
                                {r.cites.length > 2 && <span className="fine">and {r.cites.length - 2} more, all found</span>}
                              </span>
                            ) : (
                              <Ok ok={false}>No citation</Ok>
                            )}
                          </td>
                          <td>
                            {r.figures.length ? (
                              r.figures.map((f) => (
                                <Ok key={f} ok={false}>
                                  {f} does not trace
                                </Ok>
                              ))
                            ) : /\$\d/.test(r.claim) ? (
                              <Ok ok>Every figure traces</Ok>
                            ) : (
                              <span className="fine">None in the claim</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="m-validate__out">
                  <p>
                    <b>Validator:</b> {count(broken.validation.checkedClaims, "claim")} checked, {count(broken.validation.unknownCitations.length, "unknown citation")},{" "}
                    {count(broken.validation.uncitedClaims, "uncited claim")}, {count(broken.validation.amountMismatches.length, "unverified dollar figure")}.
                  </p>
                  <ul>
                    {broken.post.hits.map((h) => (
                      <li key={h.rule}>
                        <b>{h.rule}.</b> {h.detail}
                      </li>
                    ))}
                  </ul>
                  <p>
                    <b>Result:</b> the model said close at 0.91 confidence. The alert goes to{" "}
                    <span className="rec rec-review">{broken.post.recommendation === "human_review" ? "human review" : broken.post.recommendation}</span>, and it cannot be batch-approved or auto-closed.
                  </p>
                </div>
              </figure>
              <p>
                Then the rules after the model: a close below {DEFAULT_POLICY.closeConfidenceFloor.toFixed(2)} confidence becomes human review, and the alert type&apos;s autonomy level decides whether a clean,
                confident close can go in a batch or close on its own.
              </p>
            </article>

            {/* 06 The analyst decides */}
            <article className="chapter" id="decide" aria-labelledby="decide-h">
              <p className="chapter__n">06</p>
              <h2 id="decide-h">An analyst accepts or overrides, and says why.</h2>
              <p>
                The queue is ranked by risk score, with days left against your internal deadline ({DEFAULT_POLICY.internalSlaDays} days by default) on every alert. Accepting a recommendation is one click.
                Overriding it takes one of {OVERRIDE_REASONS.length} reason codes, and both feed agreement by alert type.
              </p>
              <ul className="m-reasons" aria-label="Override reason codes">
                {OVERRIDE_REASONS.map((r) => (
                  <li key={r.code}>{r.label}</li>
                ))}
              </ul>
              <p>
                On alert types at L2 or above, closes that passed every check above the confidence floor can be approved together. {pct(DEFAULT_POLICY.qaSampleRate)} of every batch, and at least one alert, is
                drawn for QA review, where a disagreement needs a written note.
              </p>
              {SHOW_SHORTCUTS && (
                <p className="m-keys">
                  <span>Keyboard:</span>
                  <span>
                    <kbd>J</kbd> <kbd>K</kbd> next and previous alert
                  </span>
                  <span>
                    <kbd>C</kbd> close
                  </span>
                  <span>
                    <kbd>E</kbd> escalate
                  </span>
                </p>
              )}
              <Frame
                src="/shots/queue.png"
                url="assay / queue"
                width={1440}
                height={900}
                alt="The Assay queue ranked by risk score, with each alert's recommendation, confidence and days left, and a bar offering batch approval of eligible closes with a QA sample."
              />
            </article>

            {/* 07 The record */}
            <article className="chapter" id="record" aria-labelledby="record-h">
              <p className="chapter__n">07</p>
              <h2 id="record-h">The file an examiner asks for already exists.</h2>
              <p>
                Every run, decision and policy change goes into one audit log, with the model and the policy version in force. Each entry&apos;s SHA-256 hash covers the one before it, so an edit anywhere breaks every
                hash after it. The chain is checked again each time the log is opened.
              </p>
              <ul className="ruled m-exports">
                <li>
                  <h3>Audit log</h3>
                  <p>CSV or JSON. Every entry with its actor, human or agent, the previous hash and its own, so the chain can be recomputed outside Assay.</p>
                </li>
                <li>
                  <h3>QA report</h3>
                  <p>A CSV of sampled alerts: the agent&apos;s recommendation, the analyst&apos;s decision, the reviewer&apos;s result and note.</p>
                </li>
                <li>
                  <h3>Model risk pack</h3>
                  <p>Purpose and scope, inputs and data lineage, method, controls, performance by alert type, limitations, change management and sign-off, in one printable document.</p>
                </li>
                <li>
                  <h3>SAR draft</h3>
                  <p>
                    An escalation&apos;s evidence mapped onto the parts of the FinCEN SAR as filed through BSA E-Filing, with fields the bundle cannot fill, such as address and TIN, marked missing. A draft for your
                    investigator. Assay never files.
                  </p>
                </li>
              </ul>
              <Frame
                src="/shots/audit.png"
                url="assay / audit log"
                width={1440}
                height={900}
                alt="The Assay audit log: a table of agent runs, analyst decisions and policy changes, each with a hash and the policy version, and a banner confirming the hash chain verified."
              />
              <p className="m-chapter-link">
                <Link className="arrow-link" href="/governance">
                  How governance works
                </Link>
                <Link className="arrow-link" href="/security">
                  Security, and what is not in place yet
                </Link>
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="sec sec--sheet m-ladder-sec" aria-labelledby="ladder-h">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">Autonomy</p>
            <h2 id="ladder-h">The agent earns more room one alert type at a time.</h2>
            <p>Each alert type has its own level. A new workspace starts most types at Recommend; nothing starts at auto-close.</p>
          </div>
          <ol className="m-ladder">
            {AUTONOMY_LEVELS.map((l) => (
              <li key={l.level} className={`m-ladder__step m-ladder__step--${l.level}`}>
                <span className="m-ladder__lvl num">L{l.level}</span>
                <h3>{l.name}</h3>
                <p>{l.detail}</p>
                <p className="m-ladder__start">
                  {l.level === 3 ? (
                    <>
                      Each close also needs {DEFAULT_POLICY.autoCloseConfidenceFloor.toFixed(2)} confidence or more. Today the {pct(L3_MIN_AGREEMENT)} on {L3_MIN_QA.toLocaleString("en-US")} bar is an owner or
                      admin attestation; the product does not yet check it against the QA data.
                    </>
                  ) : startAt(l.level) ? (
                    <>Starts here: {startAt(l.level)}</>
                  ) : (
                    <>No type starts here by default. Design-partner pilots run in shadow mode.</>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec m-never-sec" aria-labelledby="never-h">
        <div className="wrap split split--top">
          <div>
            <p className="kicker">Never automated</p>
            <h2 id="never-h">Four things the agent has no way to do.</h2>
            <p className="split__lede">These are not settings someone can switch on later. The code has no path for the agent to take them, and a SAR decision can only be recorded by a signed-in person.</p>
          </div>
          <ul className="checks checks--no m-never">
            {NEVER_AUTOMATED.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cta">
        <Guilloche className="cta__rosette" size={640} />
        <div className="wrap">
          <h2>Run all seven steps on {demoCount} synthetic alerts.</h2>
          <p>The demo runs in your browser with the rules model. Open the structuring alert, click a citation, and override the agent to see what the audit log records.</p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo" data-track="product_cta_demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot" data-track="product_cta_pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
