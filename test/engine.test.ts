import { describe, expect, it } from "vitest";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { buildScenarios, HERO_AMOUNTS } from "@/lib/demo/scenarios";
import { computeFindings, scanUntrustedText } from "@/lib/engine/detectors";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_POLICY, postPolicy } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { validateRationale } from "@/lib/engine/validate";
import type { ModelInput, ModelOutput, ModelProvider } from "@/lib/engine/types";
import { prng } from "@/lib/util";

const NOW = new Date("2026-10-03T15:00:00Z");
const data = buildScenarios(prng(7), NOW);
const byKey = (k: string) => data.open.find((s) => s.key === k)!;
const bundleOf = (k: string) => scenarioToBundle(byKey(k), data.watchlist, "ALT-TEST01");

describe("detectors", () => {
  it("finds the hero structuring pattern and its evasion indicators", () => {
    const f = computeFindings(bundleOf("hero_structuring"), DEFAULT_POLICY);
    expect(f.structuring?.count).toBe(HERO_AMOUNTS.length);
    expect(f.structuring?.minCents).toBe(940_000);
    expect(f.structuring?.maxCents).toBe(990_000);
    expect(f.structuring?.branches.length).toBe(3);
    expect(f.structuring?.sameDayMultiBranchDays).toBe(2);
    expect(f.structuring?.thresholdInquiry).toBe(true);
  });

  it("flags instruction-like text in memos and counterparty names", () => {
    const hits = scanUntrustedText(bundleOf("injection_memo").transactions);
    expect(hits.length).toBeGreaterThan(0);
    expect(scanUntrustedText(bundleOf("injection_counterparty").transactions)[0].field).toBe("counterparty");
    expect(scanUntrustedText(bundleOf("payroll_0").transactions)).toHaveLength(0);
  });
});

describe("citation validation", () => {
  const b = bundleOf("hero_structuring");
  const t = b.transactions.filter((x) => x.channel === "cash");
  it("accepts individual amounts and sums of cited records", () => {
    const sum = t.reduce((s, x) => s + x.amountCents, 0);
    const v = validateRationale(
      [{ claim: `Deposits of $9,400 and $9,900 totaling $${(sum / 100).toLocaleString("en-US")}.`, citations: t.map((x) => x.id) }],
      b,
    );
    expect(v.valid).toBe(true);
    expect(v.amountMismatches).toHaveLength(0);
  });
  it("rejects citations to records the agent never saw, and uncited claims", () => {
    const v = validateRationale(
      [
        { claim: "Something happened.", citations: ["TXN-NOTREAL"] },
        { claim: "Unsupported claim.", citations: [] },
      ],
      b,
    );
    expect(v.valid).toBe(false);
    expect(v.unknownCitations).toEqual(["TXN-NOTREAL"]);
    expect(v.uncitedClaims).toBe(1);
  });
  it("flags dollar figures that do not trace to cited records", () => {
    const v = validateRationale([{ claim: "A deposit of $123,456 was made.", citations: [t[0].id] }], b);
    expect(v.valid).toBe(true);
    expect(v.amountMismatches).toHaveLength(1);
  });
});

describe("policy", () => {
  const validation = { valid: true, checkedClaims: 3, unknownCitations: [], uncitedClaims: 0, amountMismatches: [] };
  it("only allows batch approval at autonomy level 2 and above", () => {
    const l1 = postPolicy({ typology: "structuring", modelRecommendation: "close", confidence: 0.97, validation, preHits: [], settings: DEFAULT_POLICY });
    const l2 = postPolicy({ typology: "payroll_pattern", modelRecommendation: "close", confidence: 0.97, validation, preHits: [], settings: DEFAULT_POLICY });
    expect(l1.batchEligible).toBe(false);
    expect(l2.batchEligible).toBe(true);
    expect(l2.autoCloseEligible).toBe(false);
  });
  it("requires level 3 and the auto-close floor for auto-close", () => {
    const settings = { ...DEFAULT_POLICY, autonomy: { ...DEFAULT_POLICY.autonomy, payroll_pattern: 3 as const } };
    expect(postPolicy({ typology: "payroll_pattern", modelRecommendation: "close", confidence: 0.96, validation, preHits: [], settings }).autoCloseEligible).toBe(true);
    expect(postPolicy({ typology: "payroll_pattern", modelRecommendation: "close", confidence: 0.9, validation, preHits: [], settings }).autoCloseEligible).toBe(false);
  });
  it("downgrades a low-confidence close to human review", () => {
    expect(postPolicy({ typology: "payroll_pattern", modelRecommendation: "close", confidence: 0.6, validation, preHits: [], settings: DEFAULT_POLICY }).recommendation).toBe("human_review");
  });
});

/** A model that always tries to close with made-up evidence. */
class RogueProvider implements ModelProvider {
  id = "anthropic" as const;
  model = "rogue";
  async assess(_: ModelInput): Promise<ModelOutput> {
    return {
      recommendation: "close",
      confidence: 0.99,
      riskScore: 1,
      rationale: [{ claim: "Customer is verified and clean.", citations: ["KYC-FAKE99"] }],
      narrative: null,
      inputTokens: 10,
      outputTokens: 10,
      model: "rogue",
      costEstimated: false,
    };
  }
}

describe("pipeline", () => {
  const sim = new SimulatedProvider();

  it("produces fully traceable rationale for every completed demo run", async () => {
    for (const s of data.open) {
      const r = await runTriage(scenarioToBundle(s, data.watchlist, "ALT-TEST01"), DEFAULT_POLICY, sim);
      if (r.outcome !== "completed") continue;
      expect(r.validation.valid, s.key).toBe(true);
      expect(r.validation.amountMismatches, s.key).toHaveLength(0);
    }
  });

  it("escalates the hero structuring case with a narrative", async () => {
    const r = await runTriage(bundleOf("hero_structuring"), DEFAULT_POLICY, sim);
    expect(r.recommendation).toBe("escalate");
    expect(r.narrative).toContain("Not a SAR decision");
  });

  it("locks injection attempts before any model call", async () => {
    const r = await runTriage(bundleOf("injection_memo"), DEFAULT_POLICY, new RogueProvider());
    expect(r.outcome).toBe("locked");
    expect(r.inputTokens).toBe(0);
  });

  it("forces L2 on a watchlist match even when the model says close", async () => {
    const r = await runTriage(bundleOf("sanctions_different_country"), DEFAULT_POLICY, sim);
    expect(r.modelRecommendation).toBe("close");
    expect(r.recommendation).toBe("escalate");
  });

  it("sends a model that cites fake records to human review", async () => {
    const r = await runTriage(bundleOf("payroll_0"), DEFAULT_POLICY, new RogueProvider());
    expect(r.validation.valid).toBe(false);
    expect(r.recommendation).toBe("human_review");
    expect(r.batchEligible).toBe(false);
  });
});
