import type { PolicySettings, TraceStep, ValidationResult } from "@/lib/db/schema";
import { usd } from "@/lib/util";
import { computeFindings } from "./detectors";
import { postPolicy, prePolicy } from "./policy";
import { costMicros } from "./providers";
import type { EvidenceBundle, Findings, ModelProvider, TriageResult } from "./types";
import { validateRationale } from "./validate";

const EMPTY_VALIDATION: ValidationResult = { valid: true, checkedClaims: 0, unknownCitations: [], uncitedClaims: 0, amountMismatches: [] };

/** Elapsed time to the hundredth of a millisecond. Deterministic steps really do take well under 1 ms. */
const since = (t0: number) => Math.round((performance.now() - t0) * 100) / 100;

function step(trace: TraceStep[], tool: string, label: string, summary: string, recordIds: string[], t0: number, measured?: number) {
  trace.push({ tool, label, summary, recordIds, ms: measured != null ? Math.round(measured * 100) / 100 : since(t0) });
}

function patternSummary(f: Findings, typology: string): { summary: string; ids: string[] } {
  if (typology === "structuring" && f.structuring) {
    const s = f.structuring;
    return {
      summary: `${s.count} cash deposits from ${usd(s.minCents)} to ${usd(s.maxCents)} across ${s.branches.length} branch(es) in ${s.spanDays} days; ${s.sameDayMultiBranchDays} same-day multi-branch day(s); threshold inquiry note: ${s.thresholdInquiry ? "yes" : "no"}.`,
      ids: s.txnIds,
    };
  }
  if (typology === "funnel_account" && f.funnel) {
    const x = f.funnel;
    return {
      summary: `${x.inboundCount} credits from ${x.distinctSenders} senders; ${Math.round(x.passThroughRatio * 100)}% left by wire within ${x.maxHoursToOutbound} h; destinations ${x.outboundCountries.join(", ") || "none"}.`,
      ids: [...x.outboundTxnIds],
    };
  }
  if (typology === "high_risk_wire" && f.wires) {
    const w = f.wires;
    return {
      summary: `${w.highRiskTxnIds.length} wire(s) to high-risk geographies; ${w.priorSameCountryTxnIds.length} earlier wire(s) to the same countries; documented relationship: ${w.documentedRelationship ? "yes" : "no"}.`,
      ids: w.highRiskTxnIds,
    };
  }
  if (typology === "payroll_pattern" && f.payroll) {
    const p = f.payroll;
    return { summary: `${p.payDates} batch dates, cadence ${p.cadenceDays ?? "n/a"} days, ${p.payees} payees, amount variation ${(p.amountCv * 100).toFixed(1)}%.`, ids: [] };
  }
  if (typology === "seasonal_cash" && f.seasonal) {
    const s = f.seasonal;
    return { summary: `Current 30-day revenue ${s.spikeRatio.toFixed(1)}x trailing average; prior-year windows ${s.priorYearCents.map((c) => usd(c)).join(" and ")}; prior years match: ${s.priorYearsMatch ? "yes" : "no"}.`, ids: [] };
  }
  return { summary: `30-day inflow ${usd(f.inflowCents)}, ${f.volumeVsExpected != null ? `${f.volumeVsExpected.toFixed(1)}x expected` : "no expected volume on file"}.`, ids: [] };
}

/** Pure triage: evidence in, recommendation out. No database access. */
export async function runTriage(bundle: EvidenceBundle, settings: PolicySettings, provider: ModelProvider): Promise<TriageResult> {
  const trace: TraceStep[] = [];
  const lt = bundle.loadTimings ?? {};
  let t0 = performance.now();

  step(trace, "read_alert", "Read the alert", `Rule ${bundle.alert.ruleCode}: ${bundle.alert.ruleDescription}. ${bundle.alert.triggeredTxnIds.length} triggering transaction(s).`, [bundle.alert.id, ...bundle.alert.triggeredTxnIds], t0, lt.alert);
  t0 = performance.now();
  step(trace, "read_kyc", "Read the customer profile", `${bundle.customer.kind}, ${bundle.customer.occupation ?? "occupation not recorded"}, risk rating ${bundle.customer.riskRating}.`, [bundle.customer.id], t0, lt.customer);
  t0 = performance.now();
  step(trace, "read_transactions", "Pulled transaction history", `${bundle.transactions.length} transactions in the last 90 days and ${bundle.history.length} older ones.`, [], t0, lt.transactions);
  t0 = performance.now();
  step(trace, "read_prior_cases", "Checked prior alerts and SARs", bundle.priorCases.length ? `${bundle.priorCases.length} prior case(s): ${bundle.priorCases.map((c) => `${c.kind} (${c.outcome})`).join(", ")}.` : "No prior cases.", bundle.priorCases.map((c) => c.id), t0, lt.priorCases);

  t0 = performance.now();
  const findings = computeFindings(bundle, settings);
  const findingsMs = since(t0);
  step(
    trace,
    "screen_watchlist",
    "Screened names against the watchlist",
    findings.watchlistHits.length ? `${findings.watchlistHits.length} candidate(s); top similarity ${findings.watchlistHits[0].similarity.toFixed(2)}.` : "No candidates at or above 0.80 similarity.",
    findings.watchlistHits.map((h) => h.watchlistId),
    t0,
    (lt.watchlist ?? 0) + findingsMs,
  );
  t0 = performance.now();
  step(
    trace,
    "scan_untrusted_text",
    "Scanned customer-supplied text",
    findings.injection.length ? `Instruction-like text found in ${findings.injection.length} field(s).` : "No instruction-like text in memos or counterparty names.",
    findings.injection.map((h) => h.txnId),
    t0,
  );
  t0 = performance.now();
  const ps = patternSummary(findings, bundle.alert.typology);
  step(trace, "detect_patterns", "Ran typology checks", ps.summary, ps.ids, t0);

  t0 = performance.now();
  const pre = prePolicy(bundle, findings, settings);
  step(trace, "policy_pre", "Applied pre-model policy", pre.hits.length ? pre.hits.map((h) => h.rule).join("; ") : "No rule fired.", pre.hits.flatMap((h) => h.recordIds), t0);

  const base = {
    trace,
    provider: provider.id,
    model: provider.model,
  };

  if (pre.skipModel) {
    const locked = pre.skipModel === "lock";
    step(trace, "model_assess", "Model not called", locked ? "Alert locked to human review before any model call." : "Agent abstained: not enough data to support a recommendation.", [], performance.now(), 0);
    return {
      ...base,
      outcome: locked ? "locked" : "abstained",
      modelRecommendation: null,
      recommendation: "human_review",
      confidence: 0,
      riskScore: locked ? 70 : 40,
      rationale: pre.hits.map((h) => ({ claim: h.detail, citations: h.recordIds })),
      policyHits: pre.hits,
      validation: EMPTY_VALIDATION,
      narrative: null,
      batchEligible: false,
      autoCloseEligible: false,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
      costEstimated: false,
    };
  }

  t0 = performance.now();
  let out;
  try {
    out = await provider.assess({ bundle, findings, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    step(trace, "model_assess", "Model call failed", message.slice(0, 200), [], t0);
    return {
      ...base,
      outcome: "error",
      modelRecommendation: null,
      recommendation: "human_review",
      confidence: 0,
      riskScore: 50,
      rationale: [{ claim: "The model call failed, so no recommendation was made. Review manually.", citations: [bundle.alert.id] }],
      policyHits: pre.hits,
      validation: EMPTY_VALIDATION,
      narrative: null,
      batchEligible: false,
      autoCloseEligible: false,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
      costEstimated: false,
      error: message,
    };
  }
  step(trace, "model_assess", "Model assessed the evidence", `${out.model} recommends ${out.recommendation} at ${(out.confidence * 100).toFixed(0)}% confidence with ${out.rationale.length} cited claims.`, [], t0);

  t0 = performance.now();
  const validation = validateRationale(out.rationale, bundle);
  step(
    trace,
    "validate_citations",
    "Checked every claim against the records",
    validation.valid
      ? `${validation.checkedClaims} claims, every citation resolves${validation.amountMismatches.length ? `; ${validation.amountMismatches.length} dollar figure(s) unverified` : "; every dollar figure traced"}.`
      : `${validation.unknownCitations.length} unknown citation(s), ${validation.uncitedClaims} uncited claim(s).`,
    validation.unknownCitations,
    t0,
  );

  t0 = performance.now();
  const post = postPolicy({
    typology: bundle.alert.typology,
    modelRecommendation: out.recommendation,
    confidence: out.confidence,
    validation,
    preHits: pre.hits,
    settings,
  });
  const newHits = post.hits.slice(pre.hits.length);
  step(
    trace,
    "policy_post",
    "Applied post-model policy",
    `${newHits.length ? newHits.map((h) => h.rule).join("; ") + ". " : ""}Final: ${post.recommendation.replace("_", " ")}${post.batchEligible ? ", eligible for batch approval" : ""}${post.autoCloseEligible ? ", eligible for auto-close" : ""}.`,
    [],
    t0,
  );

  const cost = costMicros(out.model, out.inputTokens, out.outputTokens);
  return {
    ...base,
    model: out.model,
    outcome: "completed",
    modelRecommendation: out.recommendation,
    recommendation: post.recommendation,
    confidence: Math.round(out.confidence * 1000) / 1000,
    riskScore: out.riskScore,
    rationale: out.rationale,
    policyHits: post.hits,
    validation,
    narrative: post.recommendation === "escalate" ? out.narrative : out.narrative,
    batchEligible: post.batchEligible,
    autoCloseEligible: post.autoCloseEligible,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costMicros: cost.micros,
    costEstimated: out.costEstimated || !cost.known,
  };
}
