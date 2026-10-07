/** Expected versus actual inflow for the customer view. Pure; money in integer cents. */

export interface InflowTxn {
  ts: string | Date;
  amountCents: number;
  direction: "in" | "out";
}

export interface InflowMonth {
  /** "2026-09" */
  key: string;
  /** "Sep 2026" */
  label: string;
  inCents: number;
  outCents: number;
  count: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Inflow and outflow per calendar month (UTC) for the `months` months ending
 * with the month of `asOf`, oldest first. Months with no activity are kept.
 */
export function monthlyFlows(txns: readonly InflowTxn[], asOf: Date, months = 3): InflowMonth[] {
  const out: InflowMonth[] = [];
  const y0 = asOf.getUTCFullYear();
  const m0 = asOf.getUTCMonth();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y0, m0 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, inCents: 0, outCents: 0, count: 0 });
  }
  const byKey = new Map(out.map((m) => [m.key, m]));
  for (const t of txns) {
    const d = t.ts instanceof Date ? t.ts : new Date(t.ts);
    if (Number.isNaN(d.getTime()) || d.getTime() > asOf.getTime()) continue;
    const m = byKey.get(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    if (!m) continue;
    const amt = Math.abs(t.amountCents);
    if (t.direction === "in") m.inCents += amt;
    else m.outCents += amt;
    m.count++;
  }
  return out;
}

export interface InflowSummary {
  /** Average monthly inflow over the trailing `days`, scaled to a 30-day month. */
  actualMonthlyInCents: number;
  expectedMonthlyCents: number | null;
  /** actual / expected, or null without an expected figure. */
  ratio: number | null;
  /** "2.4x the expected monthly volume" or a sentence for missing KYC data. */
  sentence: string;
}

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Trailing inflow against the KYC expected monthly volume. */
export function inflowVsExpected(txns: readonly InflowTxn[], expectedMonthlyCents: number | null, asOf: Date, days = 90): InflowSummary {
  const start = asOf.getTime() - days * 86_400_000;
  let inCents = 0;
  for (const t of txns) {
    const ms = (t.ts instanceof Date ? t.ts : new Date(t.ts)).getTime();
    if (t.direction === "in" && ms >= start && ms <= asOf.getTime()) inCents += Math.abs(t.amountCents);
  }
  const actual = Math.round((inCents / days) * 30);
  if (expectedMonthlyCents == null || expectedMonthlyCents <= 0) {
    return { actualMonthlyInCents: actual, expectedMonthlyCents: null, ratio: null, sentence: `${usd(actual)} a month in, on average over ${days} days. No expected volume on file to compare against.` };
  }
  const ratio = actual / expectedMonthlyCents;
  const rounded = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
  const sentence =
    ratio >= 1.15
      ? `${usd(actual)} a month in, ${rounded}x the ${usd(expectedMonthlyCents)} expected at onboarding.`
      : ratio <= 0.85
        ? `${usd(actual)} a month in, below the ${usd(expectedMonthlyCents)} expected at onboarding.`
        : `${usd(actual)} a month in, in line with the ${usd(expectedMonthlyCents)} expected at onboarding.`;
  return { actualMonthlyInCents: actual, expectedMonthlyCents, ratio, sentence };
}
