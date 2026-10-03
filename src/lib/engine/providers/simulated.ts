import type { RationaleItem } from "@/lib/db/schema";
import { DAY, usd } from "@/lib/util";
import { buildUserPrompt, SYSTEM_PROMPT } from "../prompt";
import type { EvidenceBundle, Findings, ModelInput, ModelOutput, ModelProvider } from "../types";

/**
 * Deterministic reasoning used for the public demo and for workspaces without a
 * model key. It reads the same evidence and findings a live model would, writes
 * cited rationale, and reports the token count the live prompt would have used.
 */
export class SimulatedProvider implements ModelProvider {
  id = "simulated" as const;
  model = "assay-rules-v1";

  async assess(input: ModelInput): Promise<ModelOutput> {
    const { bundle, findings } = input;
    const r = reason(bundle, findings);
    const prompt = SYSTEM_PROMPT + buildUserPrompt(input);
    const outputChars = JSON.stringify(r).length;
    return {
      ...r,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(outputChars / 4),
      model: this.model,
      costEstimated: true,
    };
  }
}

type Reasoned = Pick<ModelOutput, "recommendation" | "confidence" | "riskScore" | "rationale" | "narrative">;

const date = (d: Date) => d.toISOString().slice(0, 10);
const months = (from: Date | null, to: Date) => (from ? Math.max(1, Math.round((to.getTime() - from.getTime()) / (30 * DAY))) : null);

function profileClaim(b: EvidenceBundle): RationaleItem {
  const c = b.customer;
  const tenure = months(c.onboardedAt, b.alert.createdAt);
  const parts = [
    `Profile: ${c.kind === "business" ? "business" : "individual"}, "${c.occupation ?? "occupation not recorded"}"`,
    tenure ? `customer for ${tenure} months` : "onboarding date not recorded",
    `risk rating ${c.riskRating}`,
  ];
  if (c.expectedMonthlyVolumeCents != null) parts.push(`expected monthly volume ${usd(c.expectedMonthlyVolumeCents)}`);
  return { claim: parts.join(", ") + ".", citations: [c.id] };
}

function narrative(b: EvidenceBundle, facts: RationaleItem[], why: string): string {
  const c = b.customer;
  const ids = (xs: string[]) => `[${xs.slice(0, 6).join(", ")}${xs.length > 6 ? ", ..." : ""}]`;
  const body = facts.map((f) => `${f.claim.replace(/\.$/, "")} ${ids(f.citations)}.`).join(" ");
  return [
    `Subject: ${c.name}, ${c.kind === "business" ? "a business" : "an individual"} (${c.occupation ?? "occupation not recorded"}), ${c.onboardedAt ? `customer since ${date(c.onboardedAt)}` : "onboarding date not recorded"} [${c.id}].`,
    `Alert: ${b.alert.ruleCode}, ${b.alert.ruleDescription}, generated ${date(b.alert.createdAt)} [${b.alert.id}].`,
    `Activity: ${body}`,
    `Why it is unusual: ${why}`,
    `Draft prepared by the triage agent for L2 review. Not a SAR decision and not filed.`,
  ].join("\n\n");
}

function reason(b: EvidenceBundle, f: Findings): Reasoned {
  switch (b.alert.typology) {
    case "structuring":
      return structuring(b, f);
    case "funnel_account":
      return funnel(b, f);
    case "high_risk_wire":
      return wire(b, f);
    case "sanctions_name":
      return sanctions(b, f);
    case "payroll_pattern":
      return payroll(b, f);
    case "seasonal_cash":
      return seasonal(b, f);
    default:
      return generic(b, f);
  }
}

function structuring(b: EvidenceBundle, f: Findings): Reasoned {
  const s = f.structuring;
  if (!s || s.count < 3) return generic(b, f);
  const facts: RationaleItem[] = [
    {
      claim: `${s.count} cash deposits between ${usd(s.minCents)} and ${usd(s.maxCents)}, totaling ${usd(s.totalCents)}, across ${s.branches.length} branch${s.branches.length === 1 ? "" : "es"} in ${s.spanDays} days. Each is below the $10,000 currency transaction report threshold.`,
      citations: s.txnIds,
    },
  ];
  if (s.sameDayMultiBranchDays > 0) {
    facts.push({
      claim: `On ${s.sameDayMultiBranchDays} day${s.sameDayMultiBranchDays === 1 ? "" : "s"}, deposits were made at more than one branch on the same day.`,
      citations: s.sameDayTxnIds,
    });
  }
  if (s.thresholdInquiry) {
    facts.push({
      claim: "A bank staff note on the profile records the customer asking about the $10,000 reporting threshold.",
      citations: [b.customer.id],
    });
  }
  facts.push(profileClaim(b));
  if (f.volumeVsExpected != null) {
    facts.push({ claim: `30-day inflows are ${f.volumeVsExpected.toFixed(1)}x the expected monthly volume on file.`, citations: [b.customer.id] });
  }
  const priorSars = b.priorCases.filter((c) => c.kind === "sar");
  if (priorSars.length) facts.push({ claim: `${priorSars.length} prior SAR${priorSars.length === 1 ? "" : "s"} on file for this customer.`, citations: priorSars.map((c) => c.id) });

  const evasion = s.sameDayMultiBranchDays > 0 || s.thresholdInquiry;
  if (evasion) {
    const conf = Math.min(0.97, 0.86 + (s.sameDayMultiBranchDays > 0 ? 0.04 : 0) + (s.thresholdInquiry ? 0.05 : 0));
    return {
      recommendation: "escalate",
      confidence: conf,
      riskScore: Math.min(95, 70 + s.count * 2 + (s.thresholdInquiry ? 8 : 0)),
      rationale: facts,
      narrative: narrative(
        b,
        facts,
        "Repeated cash deposits just under the reporting threshold, split across branches, with indicators that the pattern was designed to avoid a currency transaction report.",
      ),
    };
  }
  facts.push({
    claim: "No indicator in the file that the deposits were designed to avoid reporting. FinCEN's October 2025 FAQ does not require a structuring SAR without one, so this needs analyst judgment.",
    citations: [b.customer.id],
  });
  return { recommendation: "close", confidence: 0.71, riskScore: 48, rationale: facts, narrative: null };
}

function funnel(b: EvidenceBundle, f: Findings): Reasoned {
  const fn = f.funnel;
  if (!fn) return generic(b, f);
  const facts: RationaleItem[] = [
    {
      claim: `${fn.inboundCount} incoming credits from ${fn.distinctSenders} different senders, totaling ${usd(fn.inboundCents)}, in 30 days.`,
      citations: fn.inboundTxnIds,
    },
  ];
  if (fn.outboundTxnIds.length) {
    facts.push({
      claim: `${usd(fn.outboundCents)} left by wire to ${fn.outboundCountries.join(", ")} within ${fn.maxHoursToOutbound} hours of the first credit, ${Math.round(fn.passThroughRatio * 100)}% of inflows.`,
      citations: fn.outboundTxnIds,
    });
    if (fn.highRiskDestination) {
      facts.push({ claim: `Destination ${fn.outboundCountries.filter((c) => b.highRiskCountries.includes(c)).join(", ")} is on this institution's high-risk geography list.`, citations: fn.outboundTxnIds });
    }
  }
  facts.push(profileClaim(b));

  if (fn.outboundTxnIds.length && fn.passThroughRatio >= 0.7 && fn.distinctSenders >= 6) {
    return {
      recommendation: "escalate",
      confidence: fn.highRiskDestination ? 0.94 : 0.87,
      riskScore: fn.highRiskDestination ? 90 : 78,
      rationale: facts,
      narrative: narrative(
        b,
        facts,
        "Funds from many unrelated senders were pooled and moved out by wire within days, a pass-through pattern inconsistent with the stated profile.",
      ),
    };
  }
  // Benign: credits stay put or leave by ACH to one recurring payee.
  const asOf = b.alert.createdAt.getTime();
  const achOut = b.transactions.filter((t) => t.direction === "out" && t.channel === "ach" && asOf - t.ts.getTime() <= 30 * DAY);
  const byPayee = new Map<string, string[]>();
  for (const t of achOut) byPayee.set(t.counterpartyName ?? "?", [...(byPayee.get(t.counterpartyName ?? "?") ?? []), t.id]);
  const top = [...byPayee.entries()].sort((x, y) => y[1].length - x[1].length)[0];
  if (top) {
    facts.push({ claim: `No outbound wires. Money leaves by ACH to one recurring payee ("${top[0]}").`, citations: top[1] });
  }
  return { recommendation: "close", confidence: 0.88, riskScore: 22, rationale: facts, narrative: null };
}

function wire(b: EvidenceBundle, f: Findings): Reasoned {
  const w = f.wires;
  if (!w || !w.highRiskTxnIds.length) return generic(b, f);
  const hr = b.transactions.filter((t) => w.highRiskTxnIds.includes(t.id));
  const countries = [...new Set(hr.map((t) => t.counterpartyCountry))].join(", ");
  const facts: RationaleItem[] = [
    {
      claim: `${hr.length} outbound wire${hr.length === 1 ? "" : "s"} totaling ${usd(hr.reduce((s, t) => s + t.amountCents, 0))} to ${countries}, which is on this institution's high-risk geography list.`,
      citations: w.highRiskTxnIds,
    },
    profileClaim(b),
  ];
  if (w.documentedRelationship) {
    facts.push({
      claim: `${w.priorSameCountryTxnIds.length} earlier wires to the same country predate this window, consistent with the supplier relationship recorded at onboarding.`,
      citations: [...w.priorSameCountryTxnIds.slice(0, 8), b.customer.id],
    });
    return { recommendation: "close", confidence: 0.78, riskScore: 41, rationale: facts, narrative: null };
  }
  facts.push({ claim: "No earlier wires to this country, and the profile records no foreign supplier or business purpose for it.", citations: [b.customer.id] });
  return {
    recommendation: "escalate",
    confidence: 0.89,
    riskScore: 84,
    rationale: facts,
    narrative: narrative(b, facts, "First-time wires to a high-risk jurisdiction with no documented business purpose."),
  };
}

function sanctions(b: EvidenceBundle, f: Findings): Reasoned {
  const h = f.watchlistHits[0];
  if (!h) return generic(b, f);
  const facts: RationaleItem[] = [
    {
      claim: `${h.matchedOn === "customer" ? "Customer" : "Counterparty"} name "${h.matchedName}" scores ${h.similarity.toFixed(2)} against watchlist entry "${h.watchlistName}".`,
      citations: [h.watchlistId, ...(h.txnId ? [h.txnId] : [b.customer.id])],
    },
  ];
  if (h.countryMatch === false) {
    facts.push({ claim: "Watchlist entry country differs from the counterparty's country, which points toward a false match but does not rule one out.", citations: [h.watchlistId, ...(h.txnId ? [h.txnId] : [])] });
  } else if (h.countryMatch === true) {
    facts.push({ claim: "Watchlist entry country matches the counterparty's country.", citations: [h.watchlistId, ...(h.txnId ? [h.txnId] : [])] });
  }
  facts.push(profileClaim(b));
  const likelyFalse = h.countryMatch === false && h.similarity < 0.94;
  return {
    recommendation: likelyFalse ? "close" : "escalate",
    confidence: likelyFalse ? 0.74 : 0.9,
    riskScore: likelyFalse ? 55 : 92,
    rationale: facts,
    narrative: likelyFalse
      ? null
      : narrative(b, facts, "Close name match to a watchlist entry with a matching country. Requires sanctions review."),
  };
}

function payroll(b: EvidenceBundle, f: Findings): Reasoned {
  const p = f.payroll;
  if (!p) return generic(b, f);
  const facts: RationaleItem[] = [
    {
      claim: `${p.payDates} ACH payroll batches${p.cadenceDays ? ` every ${p.cadenceDays} days` : ""} to ${p.payees} payees, totaling ${usd(p.totalCents)}.`,
      citations: p.txnIds,
    },
    {
      claim: `Per-payee amounts vary by ${(p.amountCv * 100).toFixed(1)}% on average across pay dates, consistent with salaried staff.`,
      citations: p.txnIds,
    },
    profileClaim(b),
  ];
  if (!p.consistentWithProfile) {
    return { recommendation: "close", confidence: 0.66, riskScore: 38, rationale: facts, narrative: null };
  }
  const conf = Math.min(0.98, 0.93 + (p.payDates >= 6 ? 0.03 : 0) + (b.priorCases.length === 0 ? 0.01 : 0));
  return { recommendation: "close", confidence: conf, riskScore: 9, rationale: facts, narrative: null };
}

function seasonal(b: EvidenceBundle, f: Findings): Reasoned {
  const s = f.seasonal;
  if (!s) return generic(b, f);
  const facts: RationaleItem[] = [
    {
      claim: `30-day cash, card and check deposits of ${usd(s.currentCents)} are ${s.spikeRatio.toFixed(1)}x the prior three-month monthly average.`,
      citations: s.currentTxnIds,
    },
  ];
  s.priorYearCents.forEach((c, i) => {
    if (s.priorYearTxnIds[i]?.length) {
      facts.push({ claim: `Same 30-day window ${i + 1} year${i ? "s" : ""} earlier: ${usd(c)}.`, citations: s.priorYearTxnIds[i] });
    }
  });
  facts.push(profileClaim(b));
  if (s.priorYearsMatch) {
    const conf = s.spikeRatio < 5 ? 0.92 : 0.86;
    return { recommendation: "close", confidence: conf, riskScore: 14, rationale: facts, narrative: null };
  }
  facts.push({ claim: "Prior years do not show a comparable spike, so seasonality does not explain this volume.", citations: [b.customer.id] });
  return {
    recommendation: "escalate",
    confidence: 0.73,
    riskScore: 62,
    rationale: facts,
    narrative: narrative(b, facts, "A volume spike that prior years do not explain."),
  };
}

function generic(b: EvidenceBundle, f: Findings): Reasoned {
  const facts: RationaleItem[] = [profileClaim(b)];
  if (f.volumeVsExpected != null) facts.push({ claim: `30-day inflows are ${f.volumeVsExpected.toFixed(1)}x the expected monthly volume on file.`, citations: [b.customer.id] });
  if (b.alert.triggeredTxnIds.length) facts.push({ claim: `Rule ${b.alert.ruleCode} fired on ${b.alert.triggeredTxnIds.length} transaction(s).`, citations: b.alert.triggeredTxnIds });
  const high = (f.volumeVsExpected ?? 1) > 3;
  return {
    recommendation: high ? "escalate" : "close",
    confidence: 0.6,
    riskScore: high ? 60 : 35,
    rationale: facts,
    narrative: high ? narrative(b, facts, "Volume well above the expected profile with no explanation on file.") : null,
  };
}
