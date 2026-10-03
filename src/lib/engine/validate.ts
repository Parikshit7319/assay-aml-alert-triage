import type { RationaleItem, ValidationResult } from "@/lib/db/schema";
import type { EvidenceBundle } from "./types";

const RULE_CONSTANTS_CENTS = [1_000_000, 800_000]; // $10,000 CTR threshold, $8,000 structuring floor

export function knownRecordIds(bundle: EvidenceBundle): Set<string> {
  return new Set<string>([
    bundle.alert.id,
    bundle.customer.id,
    ...bundle.transactions.map((t) => t.id),
    ...bundle.history.map((t) => t.id),
    ...bundle.priorCases.map((c) => c.id),
    ...bundle.watchlist.map((w) => w.id),
  ]);
}

function amountsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?[kKmM]\b)?/g)) {
    let dollars = Number(m[1].replace(/,/g, ""));
    if (m[3]) dollars *= /k/i.test(m[3]) ? 1_000 : 1_000_000;
    const cents = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
    out.push(Math.round(dollars * 100 + cents));
  }
  return out;
}

/**
 * Claim-to-record validation. Every claim must cite at least one record the agent
 * was actually given, and every dollar figure in a claim must be traceable to the
 * cited records (an individual amount, a sum, or the KYC expected volume).
 */
export function validateRationale(rationale: RationaleItem[], bundle: EvidenceBundle): ValidationResult {
  const known = knownRecordIds(bundle);
  const txnById = new Map([...bundle.transactions, ...bundle.history].map((t) => [t.id, t]));
  const unknown = new Set<string>();
  let uncited = 0;
  const mismatches: { claim: string; amount: string }[] = [];

  for (const item of rationale) {
    if (!item.citations?.length) {
      uncited++;
      continue;
    }
    for (const c of item.citations) if (!known.has(c)) unknown.add(c);

    const cited = item.citations.map((c) => txnById.get(c)).filter((t): t is NonNullable<typeof t> => !!t);
    const individual = new Set(cited.map((t) => t.amountCents));
    const sums = [
      cited.reduce((s, t) => s + t.amountCents, 0),
      cited.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountCents, 0),
      cited.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0),
    ];
    const allowed = [...RULE_CONSTANTS_CENTS];
    if (item.citations.includes(bundle.customer.id) && bundle.customer.expectedMonthlyVolumeCents != null) {
      allowed.push(bundle.customer.expectedMonthlyVolumeCents);
    }

    for (const amt of amountsInText(item.claim)) {
      const ok =
        [...individual].some((a) => Math.abs(a - amt) <= 100) ||
        sums.some((s) => s > 0 && Math.abs(s - amt) <= Math.max(100, s * 0.005)) ||
        allowed.some((a) => Math.abs(a - amt) <= 100);
      if (!ok) {
        mismatches.push({
          claim: item.claim,
          amount: `$${(amt / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
        });
      }
    }
  }

  return {
    valid: unknown.size === 0 && uncited === 0 && rationale.length > 0,
    checkedClaims: rationale.length,
    unknownCitations: [...unknown],
    uncitedClaims: uncited,
    amountMismatches: mismatches,
  };
}
