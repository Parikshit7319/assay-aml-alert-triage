import { buildScenarios } from "../src/lib/demo/scenarios";
import { scenarioToBundle } from "../src/lib/demo/bundle";
import { runTriage } from "../src/lib/engine/pipeline";
import { DEFAULT_POLICY } from "../src/lib/engine/policy";
import { SimulatedProvider } from "../src/lib/engine/providers/simulated";
import { prng } from "../src/lib/util";

async function main() {
  const { open, recentlyClosed, watchlist } = buildScenarios(prng(42), new Date("2026-10-03T15:00:00Z"));
  const p = new SimulatedProvider();
  const counts: Record<string, number> = {};
  let cost = 0;
  for (const s of [...open, ...recentlyClosed]) {
    const b = scenarioToBundle(s, watchlist, "ALT-TEST");
    const r = await runTriage(b, DEFAULT_POLICY, p);
    counts[r.recommendation] = (counts[r.recommendation] ?? 0) + 1;
    cost += r.costMicros;
    console.log(
      s.key.padEnd(30),
      r.outcome.padEnd(10),
      (r.modelRecommendation ?? "-").padEnd(9),
      r.recommendation.padEnd(13),
      r.confidence.toFixed(2),
      String(r.riskScore).padStart(3),
      r.batchEligible ? "batch" : "     ",
      r.validation.valid ? "valid" : "INVALID",
      r.validation.amountMismatches.length ? `MISMATCH ${JSON.stringify(r.validation.amountMismatches)}` : "",
      r.policyHits.map((h) => h.rule.split(" ")[0]).join(","),
      `${b.transactions.length}/${b.history.length} tok ${r.inputTokens}`,
    );
  }
  console.log(counts, "avg cost per run $", (cost / (open.length + recentlyClosed.length) / 1e6).toFixed(4));
}
main();
