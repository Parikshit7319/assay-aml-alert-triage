import type { PolicyHit, PolicySettings, Recommendation, Typology, ValidationResult } from "@/lib/db/schema";
import type { EvidenceBundle, Findings } from "./types";

export const DEFAULT_HIGH_RISK_COUNTRIES = ["KP", "IR", "MM"];

export const DEFAULT_POLICY: PolicySettings = {
  version: 1,
  autonomy: {
    structuring: 1,
    funnel_account: 1,
    high_risk_wire: 1,
    sanctions_name: 1,
    payroll_pattern: 2,
    seasonal_cash: 2,
    other: 1,
  },
  closeConfidenceFloor: 0.85,
  autoCloseConfidenceFloor: 0.95,
  watchlistForceL2Similarity: 0.88,
  minTransactionsForDecision: 8,
  qaSampleRate: 0.1,
  rationaleDepth: "full",
  internalSlaDays: 30,
  provider: "simulated",
};

/** Autonomy ladder copy, shared by the product UI and the marketing site. */
export const AUTONOMY_LEVELS = [
  { level: 0, name: "Shadow", detail: "Agent runs, but its recommendation stays hidden until the analyst decides. Used to measure agreement." },
  { level: 1, name: "Recommend", detail: "Agent recommends with cited rationale. The analyst decides every alert." },
  { level: 2, name: "Batch approve", detail: "High-confidence closes can be approved in a batch. A QA sample is drawn from every batch." },
  { level: 3, name: "Auto-close", detail: "Named alert types close without a click, after 98% agreement on 2,000 QA-reviewed alerts and written sign-off." },
] as const;

export const NEVER_AUTOMATED = [
  "Filing or deciding not to file a SAR",
  "Clearing a sanctions or watchlist match",
  "Contacting a customer about an alert",
  "Changing its own policy or thresholds",
];

export interface PrePolicyResult {
  hits: PolicyHit[];
  skipModel: false | "lock" | "abstain";
}

export function prePolicy(bundle: EvidenceBundle, findings: Findings, settings: PolicySettings): PrePolicyResult {
  const hits: PolicyHit[] = [];

  if (findings.injection.length) {
    hits.push({
      rule: "P1 Untrusted text contains instructions",
      effect: "lock",
      detail: `Customer-supplied text reads like an instruction to the agent (${findings.injection[0].pattern}). The alert is locked to human review and the text is never passed to the model.`,
      recordIds: findings.injection.map((h) => h.txnId),
    });
  }

  const strong = findings.watchlistHits.filter((h) => h.similarity >= settings.watchlistForceL2Similarity);
  if (strong.length) {
    hits.push({
      rule: "P2 Watchlist similarity at or above threshold",
      effect: "force_l2",
      detail: `"${strong[0].matchedName}" scores ${strong[0].similarity.toFixed(2)} against "${strong[0].watchlistName}". Policy sends this to L2 whatever the model concludes. The agent never clears a watchlist match.`,
      recordIds: [strong[0].watchlistId, ...(strong[0].txnId ? [strong[0].txnId] : [bundle.customer.id])],
    });
  }

  const thin = bundle.transactions.length < settings.minTransactionsForDecision || findings.dataCompleteness < 0.6;
  if (thin) {
    hits.push({
      rule: "P3 Not enough data to decide",
      effect: "abstain",
      detail: `${bundle.transactions.length} transactions in the lookback window (policy minimum ${settings.minTransactionsForDecision}) and ${Math.round(findings.dataCompleteness * 100)}% profile completeness. The agent abstains rather than guess.`,
      recordIds: [bundle.customer.id],
    });
  }

  const skipModel = hits.some((h) => h.effect === "lock") ? "lock" : hits.some((h) => h.effect === "abstain") ? "abstain" : false;
  return { hits, skipModel };
}

export interface PostPolicyInput {
  typology: Typology;
  modelRecommendation: "close" | "escalate";
  confidence: number;
  validation: ValidationResult;
  preHits: PolicyHit[];
  settings: PolicySettings;
}

export interface PostPolicyResult {
  recommendation: Recommendation;
  hits: PolicyHit[];
  batchEligible: boolean;
  autoCloseEligible: boolean;
}

export function postPolicy(input: PostPolicyInput): PostPolicyResult {
  const { settings, validation } = input;
  const hits = [...input.preHits];
  let rec: Recommendation = input.modelRecommendation;

  if (hits.some((h) => h.effect === "force_l2")) {
    rec = "escalate";
  }

  if (!validation.valid) {
    hits.push({
      rule: "P4 Rationale failed record validation",
      effect: "downgrade",
      detail: `${validation.unknownCitations.length} citation(s) point to records the agent was not given and ${validation.uncitedClaims} claim(s) have no citation. Sent to human review.`,
      recordIds: [],
    });
    rec = "human_review";
  }

  if (rec === "close" && input.confidence < settings.closeConfidenceFloor) {
    hits.push({
      rule: "P5 Close below confidence floor",
      effect: "downgrade",
      detail: `Model confidence ${input.confidence.toFixed(2)} is below the close floor of ${settings.closeConfidenceFloor.toFixed(2)}.`,
      recordIds: [],
    });
    rec = "human_review";
  }

  if (validation.amountMismatches.length) {
    hits.push({
      rule: "P6 Unverified dollar figure",
      effect: "block_autoclose",
      detail: `${validation.amountMismatches.length} dollar figure(s) could not be traced to cited records. Batch and auto-close are disabled for this alert.`,
      recordIds: [],
    });
  }

  const level = settings.autonomy[input.typology] ?? 1;
  const clean = hits.length === 0;
  const batchEligible = rec === "close" && clean && level >= 2 && input.confidence >= settings.closeConfidenceFloor;
  const autoCloseEligible = batchEligible && level >= 3 && input.confidence >= settings.autoCloseConfidenceFloor;

  return { recommendation: rec, hits, batchEligible, autoCloseEligible };
}
