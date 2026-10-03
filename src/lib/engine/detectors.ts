import { DAY, HOUR, nameSimilarity } from "@/lib/util";
import type { PolicySettings } from "@/lib/db/schema";
import type { EvidenceBundle, Findings, InjectionHit, TxnRecord, WatchlistHit } from "./types";

const STRUCT_LOW = 800_000; // $8,000.00
const CTR_THRESHOLD = 1_000_000; // $10,000.00

const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|rules|guidance)/i, label: "override instruction" },
  { re: /disregard\s+.{0,40}(instructions|policy|rules)/i, label: "override instruction" },
  { re: /\b(mark|set|flag)\s+(this\s+)?(alert|case|transaction|account)?\s*(as\s+)?(cleared|closed|approved|safe|legitimate)\b/i, label: "disposition command" },
  { re: /\b(do\s+not|don't|never)\s+(escalate|file|report)\b/i, label: "disposition command" },
  { re: /system\s+prompt|you\s+are\s+now\s+|act\s+as\s+(an?\s+)?(assistant|analyst|model)/i, label: "role manipulation" },
  { re: /<\/?\s*(system|instruction|assistant)\s*>/i, label: "markup injection" },
];

export function scanUntrustedText(txns: TxnRecord[]): InjectionHit[] {
  const hits: InjectionHit[] = [];
  for (const t of txns) {
    for (const [field, value] of [
      ["memo", t.memo],
      ["counterparty", t.counterpartyName],
    ] as const) {
      if (!value) continue;
      for (const p of INJECTION_PATTERNS) {
        const m = value.match(p.re);
        if (m) {
          hits.push({ txnId: t.id, field, excerpt: value.slice(0, 140), pattern: p.label });
          break;
        }
      }
    }
  }
  return hits;
}

export function screenWatchlist(bundle: EvidenceBundle, threshold = 0.8): WatchlistHit[] {
  const hits: WatchlistHit[] = [];
  const candidates: { name: string; on: "customer" | "counterparty"; txnId?: string; country: string | null }[] = [
    { name: bundle.customer.name, on: "customer", country: bundle.customer.country },
  ];
  const seen = new Set<string>();
  for (const t of bundle.transactions) {
    if (t.counterpartyName && !seen.has(t.counterpartyName)) {
      seen.add(t.counterpartyName);
      candidates.push({ name: t.counterpartyName, on: "counterparty", txnId: t.id, country: t.counterpartyCountry });
    }
  }
  for (const c of candidates) {
    for (const w of bundle.watchlist) {
      const sim = nameSimilarity(c.name, w.name);
      if (sim >= threshold) {
        hits.push({
          watchlistId: w.id,
          watchlistName: w.name,
          matchedName: c.name,
          matchedOn: c.on,
          txnId: c.txnId,
          similarity: Math.round(sim * 1000) / 1000,
          countryMatch: w.country && c.country ? w.country === c.country : null,
        });
      }
    }
  }
  return hits.sort((a, b) => b.similarity - a.similarity);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function computeFindings(bundle: EvidenceBundle, settings: PolicySettings): Findings {
  const { transactions: txns, customer, alert } = bundle;
  const asOf = alert.createdAt.getTime();
  const last30 = txns.filter((t) => asOf - t.ts.getTime() <= 30 * DAY);
  const inflowCents = last30.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountCents, 0);
  const outflowCents = last30.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
  const expected = customer.expectedMonthlyVolumeCents;

  const findings: Findings = {
    windowDays: 90,
    inflowCents,
    outflowCents,
    expectedMonthlyCents: expected,
    volumeVsExpected: expected ? Math.round((inflowCents / expected) * 100) / 100 : null,
    watchlistHits: screenWatchlist(bundle, Math.min(0.8, settings.watchlistForceL2Similarity)),
    injection: scanUntrustedText(txns),
    dataCompleteness: 0,
    priorSarCount: bundle.priorCases.filter((c) => c.kind === "sar").length,
  };

  // Data completeness: what a human analyst would need before deciding.
  const checks = [
    !!customer.occupation,
    !!customer.onboardedAt,
    customer.expectedMonthlyVolumeCents != null,
    txns.length >= settings.minTransactionsForDecision,
    bundle.history.length + txns.length >= settings.minTransactionsForDecision * 2,
  ];
  findings.dataCompleteness = checks.filter(Boolean).length / checks.length;

  // Structuring: cash deposits just under the CTR threshold within 30 days.
  const nearThreshold = last30.filter(
    (t) => t.direction === "in" && t.channel === "cash" && t.amountCents >= STRUCT_LOW && t.amountCents < CTR_THRESHOLD,
  );
  if (nearThreshold.length >= 2 || alert.typology === "structuring") {
    const byDay = new Map<string, TxnRecord[]>();
    for (const t of nearThreshold) {
      const k = dayKey(t.ts);
      byDay.set(k, [...(byDay.get(k) ?? []), t]);
    }
    const sameDay = [...byDay.values()].filter(
      (ts) => ts.length > 1 && new Set(ts.map((t) => t.branch)).size > 1,
    );
    const times = nearThreshold.map((t) => t.ts.getTime());
    const notes = customer.kycNotes ?? "";
    findings.structuring = {
      txnIds: nearThreshold.map((t) => t.id),
      count: nearThreshold.length,
      totalCents: nearThreshold.reduce((s, t) => s + t.amountCents, 0),
      minCents: nearThreshold.length ? Math.min(...nearThreshold.map((t) => t.amountCents)) : 0,
      maxCents: nearThreshold.length ? Math.max(...nearThreshold.map((t) => t.amountCents)) : 0,
      branches: [...new Set(nearThreshold.map((t) => t.branch ?? "unknown"))],
      spanDays: times.length ? Math.round((Math.max(...times) - Math.min(...times)) / DAY) + 1 : 0,
      sameDayMultiBranchDays: sameDay.length,
      sameDayTxnIds: sameDay.flat().map((t) => t.id),
      thresholdInquiry: /(\$?10,000|10k|ten thousand|reporting threshold|\bCTR\b|reported to the (government|IRS))/i.test(notes),
    };
  }

  // Funnel account: many small credits from distinct senders, then a wire out.
  const inbound = last30.filter((t) => t.direction === "in" && (t.channel === "p2p" || t.channel === "ach" || t.channel === "cash"));
  const outboundWires = last30.filter((t) => t.direction === "out" && t.channel === "wire");
  if ((inbound.length >= 8 && outboundWires.length > 0) || alert.typology === "funnel_account") {
    const inboundCents = inbound.reduce((s, t) => s + t.amountCents, 0);
    const outboundCents = outboundWires.reduce((s, t) => s + t.amountCents, 0);
    let maxHours = 0;
    for (const w of outboundWires) {
      const prior = inbound.filter((t) => t.ts < w.ts && w.ts.getTime() - t.ts.getTime() <= 7 * DAY);
      if (prior.length) {
        const earliest = Math.min(...prior.map((t) => t.ts.getTime()));
        maxHours = Math.max(maxHours, Math.round((w.ts.getTime() - earliest) / HOUR));
      }
    }
    const countries = [...new Set(outboundWires.map((t) => t.counterpartyCountry ?? "??"))];
    findings.funnel = {
      inboundTxnIds: inbound.map((t) => t.id),
      inboundCount: inbound.length,
      distinctSenders: new Set(inbound.map((t) => t.counterpartyName)).size,
      inboundCents,
      outboundTxnIds: outboundWires.map((t) => t.id),
      outboundCents,
      passThroughRatio: inboundCents ? Math.round((outboundCents / inboundCents) * 100) / 100 : 0,
      maxHoursToOutbound: maxHours,
      outboundCountries: countries,
      highRiskDestination: countries.some((c) => bundle.highRiskCountries.includes(c)),
    };
  }

  // Wires to high-risk geographies, with history to test for an established relationship.
  const wiresOut = txns.filter((t) => t.direction === "out" && t.channel === "wire");
  if (wiresOut.length || alert.typology === "high_risk_wire") {
    const countries = [...new Set(wiresOut.map((t) => t.counterpartyCountry ?? "??"))];
    const highRisk = wiresOut.filter((t) => t.counterpartyCountry && bundle.highRiskCountries.includes(t.counterpartyCountry));
    const hrCountries = new Set(highRisk.map((t) => t.counterpartyCountry));
    const priorSame = bundle.history.filter(
      (t) => t.direction === "out" && t.channel === "wire" && t.counterpartyCountry && hrCountries.has(t.counterpartyCountry),
    );
    const notes = (customer.kycNotes ?? "").toLowerCase();
    findings.wires = {
      txnIds: wiresOut.map((t) => t.id),
      totalCents: wiresOut.reduce((s, t) => s + t.amountCents, 0),
      countries,
      highRiskTxnIds: highRisk.map((t) => t.id),
      priorSameCountryTxnIds: priorSame.map((t) => t.id),
      documentedRelationship: /(supplier|vendor|importer|exporter|distributor)/.test(notes) && priorSame.length >= 3,
    };
  }

  // Payroll: recurring outbound ACH batches to many payees on a steady cadence.
  const achOut = txns.filter((t) => t.direction === "out" && t.channel === "ach");
  if (achOut.length >= 6 || alert.typology === "payroll_pattern") {
    const byDay = new Map<string, TxnRecord[]>();
    for (const t of achOut) {
      const k = dayKey(t.ts);
      byDay.set(k, [...(byDay.get(k) ?? []), t]);
    }
    const payDays = [...byDay.entries()].filter(([, ts]) => ts.length >= 3).map(([k]) => new Date(k).getTime()).sort((a, b) => a - b);
    const gaps = payDays.slice(1).map((d, i) => Math.round((d - payDays[i]) / DAY));
    const cadence = median(gaps);
    const byPayee = new Map<string, number[]>();
    for (const t of achOut) byPayee.set(t.counterpartyName ?? "?", [...(byPayee.get(t.counterpartyName ?? "?") ?? []), t.amountCents]);
    const cvs = [...byPayee.values()]
      .filter((xs) => xs.length >= 2)
      .map((xs) => {
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
        return mean ? sd / mean : 0;
      });
    const amountCv = cvs.length ? Math.round((cvs.reduce((a, b) => a + b, 0) / cvs.length) * 1000) / 1000 : 1;
    const steady = cadence != null && [7, 14, 15].some((c) => Math.abs(cadence - c) <= 1);
    findings.payroll = {
      txnIds: achOut.map((t) => t.id),
      payDates: payDays.length,
      cadenceDays: cadence,
      payees: byPayee.size,
      amountCv,
      totalCents: achOut.reduce((s, t) => s + t.amountCents, 0),
      consistentWithProfile: customer.kind === "business" && steady && amountCv < 0.15,
    };
  }

  // Seasonality: compare the current 30-day cash/card inflow to the same window in prior years.
  if (alert.typology === "seasonal_cash" || (findings.volumeVsExpected ?? 0) > 1.8) {
    const isRevenue = (t: TxnRecord) => t.direction === "in" && (t.channel === "cash" || t.channel === "card" || t.channel === "check");
    const current = last30.filter(isRevenue);
    const currentCents = current.reduce((s, t) => s + t.amountCents, 0);
    const trailing = txns.filter((t) => isRevenue(t) && asOf - t.ts.getTime() > 30 * DAY && asOf - t.ts.getTime() <= 120 * DAY);
    const trailingAvg = trailing.reduce((s, t) => s + t.amountCents, 0) / 3;
    const priorYearCents: number[] = [];
    const priorYearIds: string[][] = [];
    for (const years of [1, 2]) {
      const center = asOf - years * 365 * DAY;
      const win = bundle.history.filter((t) => isRevenue(t) && t.ts.getTime() <= center && center - t.ts.getTime() <= 30 * DAY);
      priorYearCents.push(win.reduce((s, t) => s + t.amountCents, 0));
      priorYearIds.push(win.map((t) => t.id));
    }
    const match = priorYearCents.length === 2 && priorYearCents.every((c) => c > 0 && Math.abs(c - currentCents) / currentCents <= 0.35);
    findings.seasonal = {
      currentTxnIds: current.map((t) => t.id),
      currentCents,
      trailingAvgCents: Math.round(trailingAvg),
      priorYearTxnIds: priorYearIds,
      priorYearCents,
      spikeRatio: trailingAvg ? Math.round((currentCents / trailingAvg) * 100) / 100 : 0,
      priorYearsMatch: match,
    };
  }

  return findings;
}
