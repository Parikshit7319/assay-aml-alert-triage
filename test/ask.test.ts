import { describe, expect, it } from "vitest";
import { groundAnswer } from "@/lib/ask/model";
import { answerOffline, detectIntent, SUGGESTED_QUESTIONS, type AskContext } from "@/lib/ask/offline";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { buildScenarios, HERO_AMOUNTS } from "@/lib/demo/scenarios";
import { computeFindings } from "@/lib/engine/detectors";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { knownRecordIds } from "@/lib/engine/validate";
import { prng } from "@/lib/util";

const NOW = new Date("2026-10-03T15:00:00Z");
const data = buildScenarios(prng(7), NOW);
const scenario = (k: string) => data.open.find((s) => s.key === k)!;

async function contextFor(key: string): Promise<AskContext> {
  const bundle = scenarioToBundle(scenario(key), data.watchlist, "ALT-TEST01");
  const findings = computeFindings(bundle, DEFAULT_POLICY);
  const result = await runTriage(bundle, DEFAULT_POLICY, new SimulatedProvider());
  return { bundle, findings, result };
}

const usd = (dollars: number) => `$${dollars.toLocaleString("en-US")}`;
const ids = (text: string) => [...text.matchAll(/\b[A-Z]{2,5}-[A-Z0-9]{3,16}\b(?!-)/g)].map((m) => m[0]);

function expectGrounded(ctx: AskContext, a: ReturnType<typeof answerOffline>) {
  const known = knownRecordIds(ctx.bundle);
  expect(a.source).toBe("offline");
  expect(a.citations.length).toBeGreaterThan(0);
  for (const id of a.citations) expect(known.has(id), `unknown citation ${id}`).toBe(true);
  for (const id of ids(a.answer).filter((x) => !x.startsWith("CASH-"))) expect(known.has(id), `unknown id in text ${id}`).toBe(true);
  expect(a.answer).not.toMatch(/\u2014/);
  expect(a.answer.trim().length).toBeGreaterThan(0);
}

describe("offline answerer on the hero structuring case", async () => {
  const ctx = await contextFor("hero_structuring");
  const triggered = ctx.bundle.alert.triggeredTxnIds;
  const total = HERO_AMOUNTS.reduce((s, x) => s + x, 0);

  it("runs the agent to an escalation first", () => {
    expect(ctx.result.recommendation).toBe("escalate");
    expect(triggered).toHaveLength(HERO_AMOUNTS.length);
  });

  it("explains why the agent escalated with numbers from the records", () => {
    const a = answerOffline("Why escalate?", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toMatch(/escalate/i);
    expect(a.answer).toContain(`${HERO_AMOUNTS.length} cash deposits`);
    expect(a.answer).toContain(usd(Math.min(...HERO_AMOUNTS)));
    expect(a.answer).toContain(usd(Math.max(...HERO_AMOUNTS)));
    expect(a.answer).toContain(usd(total));
    expect(a.answer).toContain("3 branches");
    expect(a.answer).toMatch(/staff note/i);
    expect(a.citations).toContain(ctx.bundle.customer.id);
    for (const id of triggered) expect(a.citations).toContain(id);
  });

  it("lists the triggering transactions", () => {
    const a = answerOffline("Which transactions?", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toContain(`${triggered.length} transactions triggered rule CASH-STRUCT-01`);
    for (const id of triggered) {
      expect(a.citations).toContain(id);
      expect(a.answer).toContain(id);
    }
    for (const amt of HERO_AMOUNTS) expect(a.answer).toContain(usd(amt));
  });

  it("totals the triggering transactions", () => {
    const a = answerOffline("What is the total?", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toContain(`The ${triggered.length} triggering transactions total ${usd(total)}`);
    expect(a.answer).toContain(`Smallest: ${usd(Math.min(...HERO_AMOUNTS))}`);
    expect(a.answer).toContain(`Largest: ${usd(Math.max(...HERO_AMOUNTS))}`);
    expect(a.answer).toContain("12 days");
    expect(a.answer).toContain(`closest is ${usd(10_000 - Math.max(...HERO_AMOUNTS))} under it`);
    const inflow = ctx.findings.inflowCents;
    expect(a.answer).toContain((inflow / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
    expect(a.answer).toContain(`${ctx.findings.volumeVsExpected!.toFixed(1)}x the expected monthly volume of $4,500`);
    for (const id of triggered) expect(a.citations).toContain(id);
  });

  it("names the evasion indicators in the counterfactual", () => {
    const a = answerOffline("What would change the recommendation?", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toMatch(/Without the staff note/);
    expect(a.answer).toMatch(/no evasion indicator/);
    expect(a.answer).toMatch(/send the alert to an analyst for review/);
    for (const id of ctx.findings.structuring!.sameDayTxnIds) expect(a.citations).toContain(id);
  });

  it("answers prior cases, watchlist, profile, policy and next steps from the file", () => {
    const prior = answerOffline("Any prior cases or SARs?", ctx);
    expectGrounded(ctx, prior);
    expect(prior.citations).toEqual(ctx.bundle.priorCases.map((c) => c.id));
    expect(prior.answer).toContain("0 SARs");

    const wl = answerOffline("Is there a watchlist match?", ctx);
    expectGrounded(ctx, wl);
    expect(wl.answer).toContain(`${ctx.bundle.watchlist.length} watchlist entries`);

    const profile = answerOffline("What is the customer's expected volume?", ctx);
    expectGrounded(ctx, profile);
    expect(profile.answer).toContain("$4,500");
    expect(profile.answer).toContain("Rideshare driver");

    const policy = answerOffline("Which policy rules applied?", ctx);
    expectGrounded(ctx, policy);
    expect(policy.answer).toMatch(/No policy rule fired/);

    const next = answerOffline("What should I check next?", ctx);
    expectGrounded(ctx, next);
    expect(next.answer).toMatch(/L2 investigator decides/);
    expect(next.answer).not.toMatch(/\b(call|contact|reach out to) the customer\b/i);
  });

  it("refuses to decide SAR filing or suggest contacting the customer", () => {
    const sar = answerOffline("Should I file a SAR?", ctx);
    expectGrounded(ctx, sar);
    expect(sar.answer).toMatch(/Neither this assistant nor the agent decides whether to file a SAR/);

    const contact = answerOffline("Can I call the customer to ask about the deposits?", ctx);
    expectGrounded(ctx, contact);
    expect(contact.answer).toMatch(/never suggests contacting the customer/);
  });

  it("falls back to a list of what it can answer", () => {
    const a = answerOffline("Tell me a joke", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toMatch(/I answer from this alert's records only/);
  });

  it("routes every suggested question to a specific answer", () => {
    expect(SUGGESTED_QUESTIONS).toHaveLength(6);
    for (const q of SUGGESTED_QUESTIONS) expect(detectIntent(q), q).not.toBe("fallback");
  });
});

describe("other outcomes", () => {
  it("explains a locked alert without assessing it", async () => {
    const ctx = await contextFor("injection_memo");
    expect(ctx.result.outcome).toBe("locked");
    const a = answerOffline("Why this recommendation?", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toMatch(/locked it to human review/);
    for (const h of ctx.findings.injection) expect(a.citations).toContain(h.txnId);
  });

  it("reports the forced L2 rule on a close watchlist match", async () => {
    const ctx = await contextFor("sanctions_close_match");
    const a = answerOffline("Is there a watchlist match?", ctx);
    expectGrounded(ctx, a);
    expect(a.answer).toContain(ctx.findings.watchlistHits[0].similarity.toFixed(2));
    expect(a.answer).toMatch(/never clears a watchlist match/);
    const cf = answerOffline("What would change the recommendation?", ctx);
    expect(cf.answer).toMatch(/Nothing the model concludes can change this/);
  });
});

describe("model answer grounding", async () => {
  const ctx = await contextFor("hero_structuring");
  it("keeps only ids that exist in the bundle", () => {
    const real = ctx.bundle.alert.triggeredTxnIds[0];
    const g = groundAnswer(`Deposit of $9,400 [${real}, TXN-FAKE99] under rule CASH-STRUCT-01 \u2014 see [TXN-NOPE00].`, ctx.bundle);
    expect(g.citations).toEqual([real]);
    expect(g.dropped.sort()).toEqual(["TXN-FAKE99", "TXN-NOPE00"]);
    expect(g.answer).toContain(`[${real}]`);
    expect(g.answer).not.toContain("TXN-FAKE99");
    expect(g.answer).not.toMatch(/\u2014/);
    expect(g.answer).toContain("CASH-STRUCT-01");
  });
});
