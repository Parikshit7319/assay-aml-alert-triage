/**
 * Data for the home page workbench replay. Every number, claim and timing here
 * comes out of the real triage engine run on the demo's synthetic scenarios:
 * the same builders, the same rules model, the same policy. Nothing is typed by
 * hand.
 *
 * Determinism: the scenario builders draw from a seeded PRNG, but record IDs
 * come from crypto random. IDs are remapped with a second seeded PRNG before
 * the run, so the server-rendered frame and the in-browser re-run carry the
 * same IDs. Only the measured step timings differ between the two.
 *
 * Plain module with no directive: the page calls it on the server for the
 * static first frame, and HeroRun imports it on demand to re-run in the browser.
 */
import type { Recommendation, Typology } from "@/lib/db/schema";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { Ctx, funnelScenario, heroStructuring, injectionScenario, payrollScenario, sanctionsScenario, WATCHLIST, type Scenario } from "@/lib/demo/scenarios";
import { scanUntrustedText } from "@/lib/engine/detectors";
import { runTriage } from "@/lib/engine/pipeline";
import { AUTONOMY_LEVELS, DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import type { TriageResult, TxnRecord, WatchlistRecord } from "@/lib/engine/types";
import { ago, TYPOLOGY_LABEL } from "@/lib/labels";
import { HOUR, prng, usd, type Rng } from "@/lib/util";

export interface HeroTxn {
  id: string;
  date: string;
  party: string;
  memo: string | null;
  channel: string;
  amount: string;
  out: boolean;
  trigger: boolean;
}

export interface HeroStep {
  tool: string;
  label: string;
  summary: string;
  ms: number;
  ids: string[];
  /** Short words for a notable result, such as a policy rule that fired. */
  flag: string | null;
}

export interface HeroRecord {
  id: string;
  label: string;
  text: string;
}

export interface HeroCase {
  key: string;
  alertId: string;
  ruleCode: string;
  ruleDescription: string;
  typology: Typology;
  typologyLabel: string;
  age: string;
  customerName: string;
  customerId: string;
  autonomy: string;
  /** Profile and staff note (both the KYC record), then a prior case or watchlist entry. */
  records: HeroRecord[];
  txns: HeroTxn[];
  txnCount: number;
  historyCount: number;
  steps: HeroStep[];
  totalMs: number;
  outcome: TriageResult["outcome"];
  recommendation: Recommendation;
  confidence: number;
  riskScore: number;
  model: string;
  batchEligible: boolean;
  policyRules: string[];
  claims: { text: string; ids: string[] }[];
  quarantine: { id: string; field: string; text: string } | null;
}

export interface HeroData {
  /** Queue order: highest risk score first, as the workbench sorts it. */
  cases: HeroCase[];
  /** Indexes into `cases` that the replay cycles through. */
  loop: number[];
}

/** Fixed clock so the server frame and the browser re-run show the same dates. */
const ANCHOR = new Date("2026-10-06T15:00:00Z");
const SEED = 20261006;
const VISIBLE_ROWS = 12;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CHANNEL: Record<TxnRecord["channel"], string> = { cash: "Cash", ach: "ACH", card: "Card", wire: "Wire", p2p: "P2P", check: "Check" };

function idMaker(rng: Rng) {
  const map = new Map<string, string>();
  return (old: string) => {
    let v = map.get(old);
    if (!v) {
      let s = "";
      for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rng.next() * ALPHABET.length)];
      v = `${old.split("-")[0]}-${s}`;
      map.set(old, v);
    }
    return v;
  };
}

function stable(s: Scenario, id: (old: string) => string): Scenario {
  return {
    ...s,
    customer: { ...s.customer, id: id(s.customer.id) },
    transactions: s.transactions.map((t) => ({ ...t, id: id(t.id) })),
    priorCases: s.priorCases.map((c) => ({ ...c, id: id(c.id) })),
    alert: { ...s.alert, triggeredTxnIds: s.alert.triggeredTxnIds.map(id) },
  };
}

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function flagFor(tool: string, label: string, summary: string, ids: string[]): string | null {
  if (tool === "scan_untrusted_text" && ids.length) return "Flagged";
  if (tool === "screen_watchlist" && ids.length) return "Candidate";
  if (tool === "model_assess" && label === "Model not called") return "Skipped";
  if (tool === "policy_pre" || tool === "policy_post") {
    const rules = [...new Set(summary.match(/\bP\d\b/g) ?? [])];
    if (rules.length) return `${rules.join(", ")} fired`;
  }
  return null;
}

async function build(s: Scenario, alertId: string, watchlist: WatchlistRecord[]): Promise<HeroCase> {
  const bundle = scenarioToBundle(s, watchlist, alertId);
  const r = await runTriage(bundle, DEFAULT_POLICY, new SimulatedProvider());

  const cited = new Set(r.rationale.flatMap((x) => x.citations));
  const trig = new Set(s.alert.triggeredTxnIds);
  const rank = (t: TxnRecord) => (trig.has(t.id) ? 0 : cited.has(t.id) ? 1 : t.channel !== "card" ? 2 : 3);
  const rows = [...bundle.transactions]
    .sort((a, b) => rank(a) - rank(b) || b.ts.getTime() - a.ts.getTime())
    .slice(0, VISIBLE_ROWS)
    .sort((a, b) => b.ts.getTime() - a.ts.getTime());

  const c = s.customer;
  const kindWord = c.kind === "business" ? "Business" : "Individual";
  const profile = [
    `${kindWord}, ${c.occupation ?? "occupation not recorded"}`,
    c.onboardedAt ? `customer since ${month(c.onboardedAt)}` : "onboarding date not recorded",
    `${c.riskRating} risk`,
    c.expectedMonthlyVolumeCents != null ? `expects ${usd(c.expectedMonthlyVolumeCents)} a month` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const wl = watchlist.find((w) => cited.has(w.id));
  const prior = bundle.priorCases[0];
  const third: HeroRecord = wl
    ? { id: wl.id, label: "Watchlist", text: `${wl.name}, ${wl.listName}${wl.country ? `, ${wl.country}` : ""}` }
    : prior
      ? { id: prior.id, label: "Prior case", text: `${prior.kind === "sar" ? "SAR" : "Alert"} ${prior.outcome}, ${month(prior.openedAt)}. ${prior.summary}` }
      : { id: "", label: "Prior cases", text: "None on file" };

  const inj = r.outcome === "locked" ? scanUntrustedText(bundle.transactions)[0] : undefined;
  const lvl = DEFAULT_POLICY.autonomy[s.alert.typology] ?? 1;
  const known = new Set<string>([c.id, ...rows.map((t) => t.id), third.id].filter(Boolean));

  return {
    key: s.key,
    alertId,
    ruleCode: s.alert.ruleCode,
    ruleDescription: s.alert.ruleDescription,
    typology: s.alert.typology,
    typologyLabel: TYPOLOGY_LABEL[s.alert.typology],
    age: ago(s.alert.createdAt, ANCHOR),
    customerName: c.name,
    customerId: c.id,
    autonomy: `L${lvl} ${AUTONOMY_LEVELS[lvl]?.name ?? ""}`.trim(),
    records: [
      { id: c.id, label: "Profile", text: profile },
      { id: c.id, label: "Staff note", text: c.kycNotes ?? "None on file" },
      third,
    ],
    txns: rows.map((t) => ({
      id: t.id,
      date: day(t.ts),
      party: [t.branch ?? t.counterpartyName ?? "Not recorded", t.counterpartyCountry && t.counterpartyCountry !== "US" ? `(${t.counterpartyCountry})` : ""].filter(Boolean).join(" "),
      memo: t.memo,
      channel: CHANNEL[t.channel],
      amount: `${t.direction === "out" ? "−" : ""}${usd(t.amountCents, { cents: true })}`,
      out: t.direction === "out",
      trigger: trig.has(t.id),
    })),
    txnCount: bundle.transactions.length,
    historyCount: bundle.history.length,
    steps: r.trace.map((t) => ({
      tool: t.tool,
      label: t.label,
      summary: t.summary,
      ms: t.ms,
      ids: t.recordIds.filter((x) => known.has(x)),
      flag: flagFor(t.tool, t.label, t.summary, t.recordIds),
    })),
    totalMs: Math.round(r.trace.reduce((sum, t) => sum + t.ms, 0) * 100) / 100,
    outcome: r.outcome,
    recommendation: r.recommendation,
    confidence: r.confidence,
    riskScore: r.riskScore,
    model: r.model,
    batchEligible: r.batchEligible,
    policyRules: r.policyHits.map((h) => h.rule),
    claims: r.rationale.map((x) => ({ text: x.claim, ids: x.citations })),
    quarantine: inj ? { id: inj.txnId, field: inj.field === "memo" ? "Memo" : "Counterparty name", text: inj.excerpt } : null,
  };
}

/** Builds five alerts, runs each through the engine, and returns them in queue order. */
export async function buildHeroRuns(): Promise<HeroData> {
  const ctx = new Ctx(prng(SEED), ANCHOR);
  const id = idMaker(prng(SEED + 1));
  const at = (h: number) => new Date(ANCHOR.getTime() - h * HOUR);
  const watchlist = WATCHLIST.map((w) => ({ ...w, id: id(`WL-${w.name}`) }));

  const plan: [Scenario, string][] = [
    [heroStructuring(ctx, at(1)), "ALT-7Q2M4K"],
    [sanctionsScenario(ctx, at(3), "close_match"), "ALT-4HN8TC"],
    [funnelScenario(ctx, at(4), "high_risk"), "ALT-9WRD3E"],
    [injectionScenario(ctx, at(6), "memo"), "ALT-K2V6PX"],
    [payrollScenario(ctx, at(8), 0, false), "ALT-M5Z7QA"],
  ];
  const cases: HeroCase[] = [];
  for (const [s, alertId] of plan) cases.push(await build(stable(s, id), alertId, watchlist));
  cases.sort((a, b) => b.riskScore - a.riskScore);

  const find = (key: string) => cases.findIndex((c) => c.key === key);
  return { cases, loop: [find("hero_structuring"), find("payroll_0"), find("injection_memo")].filter((i) => i >= 0) };
}
