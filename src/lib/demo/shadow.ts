/**
 * Synthetic shadow-mode history: the real engine triages a few months of
 * generated alerts, and a simulated analyst team decides each one without
 * seeing the agent's answer. The agreement numbers that come out are what a
 * bank would review before moving a typology up the autonomy ladder.
 */
import type { Typology } from "@/lib/db/schema";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import type { TriageResult, WatchlistRecord } from "@/lib/engine/types";
import { DAY, newId } from "@/lib/util";
import { scenarioToBundle } from "./bundle";
import { derivedRng, mixedScenario } from "./live-feed";
import { Ctx, WATCHLIST } from "./scenarios";

export type ShadowDecision = "close" | "escalate";

export interface ShadowRow {
  id: string;
  typology: Typology;
  customerName: string;
  /** Final recommendation after policy. */
  agent: ShadowDecision | "human_review";
  /** What the model said before policy; null when it was not called (locked or abstained). */
  model: ShadowDecision | null;
  /** Simulated analyst decision, made blind to the agent. */
  human: ShadowDecision;
  confidence: number;
  createdAt: Date;
}

/** Probability the simulated analyst lands where the agent did, by typology. */
export const HUMAN_AGREEMENT: Record<Typology, number> = {
  payroll_pattern: 0.99,
  seasonal_cash: 0.96,
  structuring: 0.9,
  funnel_account: 0.92,
  high_risk_wire: 0.86,
  sanctions_name: 0.93,
  other: 0.75,
};

const SHADOW_WINDOW_DAYS = 60;

/**
 * The decision the analyst is compared against: the agent's final call, or the
 * model's call when policy sent it to human review. When the model was never
 * called, fall back to the engine's risk score (locked alerts score 70, abstains 40).
 */
function referenceDecision(r: TriageResult): ShadowDecision {
  if (r.recommendation !== "human_review") return r.recommendation;
  if (r.modelRecommendation && r.modelRecommendation !== "human_review") return r.modelRecommendation;
  return r.riskScore >= 50 ? "escalate" : "close";
}

/**
 * Generates `n` alerts over the last 60 days from the live-feed mix, triages
 * each with the real engine and the simulated provider, and assigns a
 * deterministic synthetic human decision. Rows come back oldest first.
 */
export async function buildShadowSet(seed: number, now: Date, n = 160): Promise<ShadowRow[]> {
  const c = new Ctx(derivedRng(seed, "shadow-scenarios"), now);
  const humanRng = derivedRng(seed, "shadow-humans");
  const watchlist: WatchlistRecord[] = WATCHLIST.map((w) => ({ ...w, id: newId("WL") }));
  const provider = new SimulatedProvider();

  const rows: ShadowRow[] = [];
  for (let i = 0; i < n; i++) {
    const alertAt = new Date(now.getTime() - c.rng.next() * SHADOW_WINDOW_DAYS * DAY);
    const s = mixedScenario(c, alertAt);
    const id = newId("ALT");
    const r = await runTriage(scenarioToBundle(s, watchlist, id), DEFAULT_POLICY, provider);
    const typology = s.alert.typology;
    const ref = referenceDecision(r);
    const agrees = humanRng.chance(HUMAN_AGREEMENT[typology] ?? HUMAN_AGREEMENT.other);
    const model = r.modelRecommendation === "close" || r.modelRecommendation === "escalate" ? r.modelRecommendation : null;
    rows.push({
      id,
      typology,
      customerName: s.customer.name,
      agent: r.recommendation,
      model,
      human: agrees ? ref : ref === "close" ? "escalate" : "close",
      confidence: r.confidence,
      createdAt: s.alert.createdAt,
    });
    // Yield now and then so a browser caller keeps painting while this runs.
    if (i % 16 === 15) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export interface ConfusionMatrix {
  total: number;
  agentClose_humanClose: number;
  agentClose_humanEscalate: number;
  agentEscalate_humanClose: number;
  agentEscalate_humanEscalate: number;
  review_humanClose: number;
  review_humanEscalate: number;
  /** Share of alerts the agent decided (close or escalate) where the human made the same call. Null with no decided alerts. */
  agreementRate: number | null;
  /** Agent closed, human escalated, over all agent closes. The number a regulator asks about. */
  missedEscalationRate: number | null;
  /** Agent escalated, human closed, over all agent escalations. */
  overEscalationRate: number | null;
  /** Share of all alerts the agent sent to human review. */
  reviewRate: number | null;
}

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

/** Agent-versus-human counts and rates, optionally for one typology. */
export function confusionMatrix(rows: readonly ShadowRow[], typology?: Typology): ConfusionMatrix {
  const m = {
    agentClose_humanClose: 0,
    agentClose_humanEscalate: 0,
    agentEscalate_humanClose: 0,
    agentEscalate_humanEscalate: 0,
    review_humanClose: 0,
    review_humanEscalate: 0,
  };
  let total = 0;
  for (const r of rows) {
    if (typology && r.typology !== typology) continue;
    total++;
    const h = r.human === "close" ? "humanClose" : "humanEscalate";
    const a = r.agent === "close" ? "agentClose" : r.agent === "escalate" ? "agentEscalate" : "review";
    m[`${a}_${h}` as keyof typeof m]++;
  }
  const closes = m.agentClose_humanClose + m.agentClose_humanEscalate;
  const escalations = m.agentEscalate_humanClose + m.agentEscalate_humanEscalate;
  const reviews = m.review_humanClose + m.review_humanEscalate;
  return {
    total,
    ...m,
    agreementRate: ratio(m.agentClose_humanClose + m.agentEscalate_humanEscalate, closes + escalations),
    missedEscalationRate: ratio(m.agentClose_humanEscalate, closes),
    overEscalationRate: ratio(m.agentEscalate_humanClose, escalations),
    reviewRate: ratio(reviews, total),
  };
}
