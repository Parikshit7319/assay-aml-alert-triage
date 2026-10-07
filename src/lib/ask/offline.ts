/**
 * Deterministic question answering over one alert's evidence. Used when the
 * visitor has not added a model key. Every number is computed from the records
 * in the bundle and every answer cites real record ids in square brackets.
 * It never suggests contacting the customer and never decides SAR filing.
 */
import { NEVER_AUTOMATED } from "@/lib/engine/policy";
import type { EvidenceBundle, Findings, TxnRecord } from "@/lib/engine/types";
import { knownRecordIds } from "@/lib/engine/validate";

export type AskResult = {
  recommendation: string;
  modelRecommendation: string | null;
  confidence: number;
  riskScore: number;
  rationale: { claim: string; citations: string[] }[];
  policyHits: { rule: string; detail: string; recordIds: string[] }[];
  outcome: string;
};

export type AskContext = { bundle: EvidenceBundle; findings: Findings; result: AskResult };

export type AskAnswer = { answer: string; citations: string[]; source: "offline" | "model" };

export const SUGGESTED_QUESTIONS: string[] = [
  "Why this recommendation?",
  "Which transactions triggered it?",
  "What is the total?",
  "Any prior cases or SARs?",
  "What would change the recommendation?",
  "What should I check next?",
];

/* ------------------------------- Formatting ------------------------------ */

const DAY_MS = 86_400_000;
const CTR_CENTS = 1_000_000;
const CHANNEL: Record<string, string> = { cash: "cash", wire: "wire", ach: "ACH", p2p: "P2P", card: "card", check: "check" };

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));
const ms = (d: Date | string) => toDate(d).getTime();
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const sum = (ts: TxnRecord[]) => ts.reduce((s, t) => s + t.amountCents, 0);

export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

function day(d: Date | string): string {
  return toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function shortDay(d: Date | string): string {
  return toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Inline citation group, e.g. " [TXN-1, TXN-2]". */
function br(ids: string[]): string {
  const u = uniq(ids.filter(Boolean));
  return u.length ? ` [${u.join(", ")}]` : "";
}

function ratio(a: number, b: number | null): string | null {
  return b ? `${(Math.round((a / b) * 10) / 10).toFixed(1)}x` : null;
}

class Writer {
  lines: string[] = [];
  ids: string[] = [];
  /** A sentence with its citations appended before the final period. */
  line(text: string, ids: string[] = []) {
    const m = text.match(/^([\s\S]*?)([.:])?$/);
    const body = m?.[1] ?? text;
    const end = m?.[2] ?? "";
    this.lines.push(`${body}${br(ids)}${end}`);
    this.ids.push(...ids);
  }
  bullet(text: string, ids: string[] = []) {
    this.line(`- ${text}`, ids);
  }
  /** Text that already carries its own inline brackets. */
  raw(text: string, ids: string[] = []) {
    this.lines.push(text);
    this.ids.push(...ids);
  }
}

/* --------------------------------- Context -------------------------------- */

function derive(ctx: AskContext) {
  const b = ctx.bundle;
  const byId = new Map([...b.transactions, ...b.history].map((t) => [t.id, t]));
  const asOf = ms(b.alert.createdAt);
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((t): t is TxnRecord => !!t);
  const last30 = b.transactions.filter((t) => asOf - ms(t.ts) <= 30 * DAY_MS);
  return {
    b,
    f: ctx.findings,
    r: ctx.result,
    kyc: b.customer.id,
    asOf,
    pick,
    last30In: last30.filter((t) => t.direction === "in"),
    last30Out: last30.filter((t) => t.direction === "out"),
    injected: new Set(ctx.findings.injection.map((h) => h.txnId)),
    triggered: pick(b.alert.triggeredTxnIds),
  };
}
type D = ReturnType<typeof derive>;

function stats(txns: TxnRecord[]) {
  const sorted = [...txns].sort((a, b) => ms(a.ts) - ms(b.ts));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const ins = txns.filter((t) => t.direction === "in");
  const outs = txns.filter((t) => t.direction === "out");
  return {
    count: txns.length,
    total: sum(txns),
    inCents: sum(ins),
    outCents: sum(outs),
    inCount: ins.length,
    outCount: outs.length,
    min: txns.reduce((m, t) => (t.amountCents < m.amountCents ? t : m), txns[0]),
    max: txns.reduce((m, t) => (t.amountCents > m.amountCents ? t : m), txns[0]),
    first,
    last,
    spanDays: first && last ? Math.round((ms(last.ts) - ms(first.ts)) / DAY_MS) + 1 : 0,
    sorted,
  };
}

function verdict(r: AskResult): string {
  if (r.outcome === "locked") return "locked to human review";
  if (r.outcome === "abstained") return "no recommendation (the agent abstained)";
  if (r.outcome === "error") return "no recommendation (the model call failed)";
  if (r.recommendation === "escalate") return "escalate to L2";
  if (r.recommendation === "close") return "close";
  if (r.recommendation === "human_review") return "send to an analyst for review";
  return r.recommendation.replace(/_/g, " ");
}

function txnLine(t: TxnRecord, d: D): string {
  const parts = [`${day(t.ts)}: ${money(t.amountCents)} ${CHANNEL[t.channel] ?? t.channel} ${t.direction === "in" ? "in" : "out"}`];
  if (t.counterpartyName) {
    const name = d.injected.has(t.id) ? "a counterparty whose text is flagged as instruction-like" : t.counterpartyName;
    parts.push(`${t.direction === "in" ? "from" : "to"} ${name}${t.counterpartyCountry && t.counterpartyCountry !== "US" ? ` (${t.counterpartyCountry})` : ""}`);
  }
  if (t.branch) parts.push(`at ${t.branch}`);
  return parts.join(" ");
}

/** The transactions the typology check relied on, when the alert lists none. */
function typologyTxns(d: D): TxnRecord[] {
  const f = d.f;
  switch (d.b.alert.typology) {
    case "structuring":
      return d.pick(f.structuring?.txnIds ?? []);
    case "funnel_account":
      return d.pick([...(f.funnel?.inboundTxnIds ?? []), ...(f.funnel?.outboundTxnIds ?? [])]);
    case "high_risk_wire":
      return d.pick(f.wires?.highRiskTxnIds.length ? f.wires.highRiskTxnIds : (f.wires?.txnIds ?? []));
    case "payroll_pattern":
      return d.pick(f.payroll?.txnIds ?? []);
    case "seasonal_cash":
      return d.pick(f.seasonal?.currentTxnIds ?? []);
    default:
      return [];
  }
}

function focus(d: D): { txns: TxnRecord[]; label: string } {
  if (d.triggered.length) return { txns: d.triggered, label: "triggering transaction" };
  return { txns: typologyTxns(d), label: "transaction the check used" };
}

/* --------------------------------- Facts ---------------------------------- */

type Fact = { text: string; ids: string[] };

function volumeFact(d: D): Fact | null {
  const exp = d.b.customer.expectedMonthlyVolumeCents;
  if (!d.last30In.length) return null;
  const inflow = sum(d.last30In);
  const x = ratio(inflow, exp);
  return {
    text: `Incoming money in the 30 days before the alert was ${money(inflow)}${x && exp != null ? `, ${x} the expected monthly volume of ${money(exp)} on the profile` : ""}.`,
    ids: [d.kyc],
  };
}

function sameDayDays(d: D, ids: string[]): string[] {
  return uniq(d.pick(ids).sort((a, b) => ms(a.ts) - ms(b.ts)).map((t) => shortDay(t.ts)));
}

function staffNote(d: D): string | null {
  const n = d.b.customer.kycNotes?.trim();
  if (!n) return null;
  return n.length > 220 ? `${n.slice(0, 217)}...` : n;
}

function structuringFacts(d: D): Fact[] {
  const s = d.f.structuring;
  if (!s || !s.count) return [];
  const txns = d.pick(s.txnIds);
  if (!txns.length) return [];
  const st = stats(txns);
  const branches = uniq(txns.map((t) => t.branch ?? "unknown location"));
  const facts: Fact[] = [
    {
      text: `${plural(st.count, "cash deposit")} from ${money(st.min.amountCents)} to ${money(st.max.amountCents)}, totaling ${money(st.total)}, at ${plural(branches.length, "branch", "branches")} over ${plural(st.spanDays, "day")}. Each is under the $10,000 currency transaction report threshold.`,
      ids: s.txnIds,
    },
  ];
  if (s.sameDayMultiBranchDays > 0) {
    const days = sameDayDays(d, s.sameDayTxnIds);
    facts.push({ text: `On ${list(days)}, deposits were made at more than one branch on the same day.`, ids: s.sameDayTxnIds });
  }
  const note = staffNote(d);
  if (s.thresholdInquiry && note) facts.push({ text: `Staff note on the profile: "${note}"`, ids: [d.kyc] });
  const evasion = s.sameDayMultiBranchDays > 0 || s.thresholdInquiry;
  facts.push(
    evasion
      ? { text: "Those are evasion indicators. FinCEN's October 2025 SAR FAQ looks for signs the deposits were designed to avoid reporting, not amounts alone.", ids: [] }
      : { text: "The file has no sign the deposits were designed to avoid reporting. Under FinCEN's October 2025 SAR FAQ, amounts alone do not require a structuring SAR.", ids: [d.kyc] },
  );
  const v = volumeFact(d);
  if (v) facts.push(v);
  return facts;
}

function funnelFacts(d: D): Fact[] {
  const x = d.f.funnel;
  if (!x) return [];
  const inb = d.pick(x.inboundTxnIds);
  const out = d.pick(x.outboundTxnIds);
  const inSum = sum(inb);
  const outSum = sum(out);
  const senders = new Set(inb.map((t) => t.counterpartyName ?? "unknown")).size;
  const facts: Fact[] = [];
  if (inb.length) facts.push({ text: `${plural(inb.length, "incoming credit")} from ${plural(senders, "sender")}, totaling ${money(inSum)}, in the 30 days before the alert.`, ids: x.inboundTxnIds });
  if (out.length) {
    const countries = uniq(out.map((t) => t.counterpartyCountry ?? "unknown country"));
    const pct = inSum ? Math.round((outSum / inSum) * 100) : 0;
    facts.push({
      text: `${money(outSum)} left by ${plural(out.length, "wire")} to ${list(countries)}, ${pct}% of the incoming total, within ${plural(x.maxHoursToOutbound, "hour")} of the first credit.`,
      ids: x.outboundTxnIds,
    });
    const hr = out.filter((t) => t.counterpartyCountry && d.b.highRiskCountries.includes(t.counterpartyCountry));
    if (hr.length) facts.push({ text: `${list(uniq(hr.map((t) => t.counterpartyCountry!)))} is on this institution's high-risk geography list.`, ids: hr.map((t) => t.id) });
  } else {
    facts.push({ text: "No money left by wire in the window.", ids: [d.kyc] });
  }
  return facts;
}

function wireFacts(d: D): Fact[] {
  const w = d.f.wires;
  if (!w) return [];
  const hr = d.pick(w.highRiskTxnIds);
  const facts: Fact[] = [];
  if (hr.length) {
    const countries = uniq(hr.map((t) => t.counterpartyCountry ?? "unknown"));
    facts.push({ text: `${plural(hr.length, "outbound wire")} totaling ${money(sum(hr))} to ${list(countries)}, which is on this institution's high-risk geography list.`, ids: w.highRiskTxnIds });
    const prior = d.pick(w.priorSameCountryTxnIds);
    if (prior.length) {
      const st = stats(prior);
      facts.push({ text: `${plural(prior.length, "earlier wire")} to the same ${countries.length === 1 ? "country" : "countries"} between ${day(st.first.ts)} and ${day(st.last.ts)}.`, ids: st.sorted.slice(-8).map((t) => t.id) });
    } else {
      facts.push({ text: "No earlier wires to these countries in the older history.", ids: [d.kyc] });
    }
  } else {
    const all = d.pick(w.txnIds);
    if (all.length) facts.push({ text: `${plural(all.length, "outbound wire")} totaling ${money(sum(all))} to ${list(w.countries)}. None goes to a high-risk country.`, ids: w.txnIds });
  }
  facts.push({ text: w.documentedRelationship ? "The profile documents a supplier or trading relationship." : "The profile records no supplier or trading relationship that explains these wires.", ids: [d.kyc] });
  return facts;
}

function sanctionsFacts(d: D): Fact[] {
  return d.f.watchlistHits.slice(0, 3).map((h) => ({
    text: `${h.matchedOn === "customer" ? "Customer" : "Counterparty"} name "${h.matchedName}" scores ${h.similarity.toFixed(2)} against watchlist entry "${h.watchlistName}"${h.countryMatch === true ? ", and the country matches" : h.countryMatch === false ? ", but the country differs" : ""}.`,
    ids: [h.watchlistId, h.txnId ?? d.kyc],
  }));
}

function payrollFacts(d: D): Fact[] {
  const p = d.f.payroll;
  if (!p) return [];
  const txns = d.pick(p.txnIds);
  return [
    {
      text: `${plural(p.payDates, "payroll batch date")}${p.cadenceDays ? ` every ${p.cadenceDays} days` : ""} to ${plural(p.payees, "payee")}, totaling ${money(sum(txns))}. Per-payee amounts vary by ${(p.amountCv * 100).toFixed(1)}% on average.`,
      ids: p.txnIds,
    },
    { text: p.consistentWithProfile ? "That fits a business running steady payroll." : "The pattern does not fully fit steady payroll for this profile.", ids: [d.kyc] },
  ];
}

function seasonalFacts(d: D): Fact[] {
  const s = d.f.seasonal;
  if (!s) return [];
  const facts: Fact[] = [
    {
      text: `Cash, card and check deposits in the last 30 days total ${money(sum(d.pick(s.currentTxnIds)))}${s.trailingAvgCents ? `, ${s.spikeRatio.toFixed(1)}x the monthly average of the three months before` : ""}.`,
      ids: s.currentTxnIds,
    },
  ];
  s.priorYearTxnIds.forEach((ids, i) => {
    if (ids.length) facts.push({ text: `Same 30-day window ${plural(i + 1, "year")} earlier: ${money(sum(d.pick(ids)))}.`, ids });
  });
  facts.push({ text: s.priorYearsMatch ? "Prior years show a similar spike, which points to seasonality." : "Prior years do not show a similar spike.", ids: [d.kyc] });
  return facts;
}

function genericFacts(d: D): Fact[] {
  const facts: Fact[] = [];
  if (d.triggered.length) {
    const st = stats(d.triggered);
    facts.push({ text: `Rule ${d.b.alert.ruleCode} fired on ${plural(st.count, "transaction")} totaling ${money(st.total)}.`, ids: d.triggered.map((t) => t.id) });
  }
  const v = volumeFact(d);
  if (v) facts.push(v);
  return facts;
}

function drivers(d: D): Fact[] {
  const typ = d.b.alert.typology;
  let facts: Fact[] =
    typ === "structuring"
      ? structuringFacts(d)
      : typ === "funnel_account"
        ? funnelFacts(d)
        : typ === "high_risk_wire"
          ? wireFacts(d)
          : typ === "sanctions_name"
            ? sanctionsFacts(d)
            : typ === "payroll_pattern"
              ? payrollFacts(d)
              : typ === "seasonal_cash"
                ? seasonalFacts(d)
                : [];
  if (!facts.length) facts = genericFacts(d);
  if (typ !== "sanctions_name" && d.f.watchlistHits.length) facts.push(...sanctionsFacts(d).slice(0, 1));
  if (d.f.injection.length) {
    facts.push({ text: `Customer-supplied text in ${plural(d.f.injection.length, "field")} reads like an instruction to the agent. It is treated as data only.`, ids: d.f.injection.map((h) => h.txnId) });
  }
  const sars = d.b.priorCases.filter((c) => c.kind === "sar");
  if (sars.length) facts.push({ text: `${plural(sars.length, "prior SAR")} on file for this customer.`, ids: sars.map((c) => c.id) });
  return facts;
}

/* -------------------------------- Answers --------------------------------- */

function answerWhy(d: D): Writer {
  const w = new Writer();
  const r = d.r;
  if (r.outcome === "locked" || r.outcome === "abstained") {
    w.line(
      r.outcome === "locked"
        ? "The agent did not assess this alert. Policy locked it to human review before any model call."
        : "The agent abstained. Policy found too little data to support a recommendation.",
    );
    for (const h of r.policyHits) w.bullet(`${h.rule}. ${h.detail}`, h.recordIds.length ? h.recordIds : [d.kyc]);
    return w;
  }
  if (r.outcome === "error") {
    w.line("The model call failed, so there is no recommendation. Review the alert manually.", [d.b.alert.id]);
    return w;
  }
  w.line(`The agent recommends: ${verdict(r)}. Confidence ${Math.round(r.confidence * 100)}%, risk score ${r.riskScore} of 100.`);
  if (r.modelRecommendation && r.modelRecommendation !== r.recommendation && r.policyHits.length) {
    w.line(`The model said ${r.modelRecommendation.replace(/_/g, " ")}. Policy changed it: ${r.policyHits.map((h) => h.rule).join("; ")}.`, r.policyHits.flatMap((h) => h.recordIds));
  }
  const facts = drivers(d);
  if (facts.length) {
    w.line("What drove it:");
    for (const f of facts.slice(0, 6)) w.bullet(f.text, f.ids);
  }
  const known = knownRecordIds(d.b);
  const cites = r.rationale.flatMap((x) => x.citations);
  const unknown = cites.filter((id) => !known.has(id));
  if (r.rationale.length) {
    w.line(
      unknown.length
        ? `The agent's written rationale has ${plural(r.rationale.length, "claim")}. ${plural(unknown.length, "citation")} in it do not match a record in this file.`
        : `The agent's written rationale has ${plural(r.rationale.length, "claim")}, and every citation in it resolves to a record in this file.`,
    );
  }
  return w;
}

function answerEvidence(d: D): Writer {
  const w = new Writer();
  const MAX = 12;
  const a = d.b.alert;
  let txns = d.triggered;
  if (txns.length) {
    w.line(`${plural(txns.length, "transaction")} triggered rule ${a.ruleCode} ("${a.ruleDescription}"):`);
  } else {
    txns = typologyTxns(d);
    if (txns.length) w.line(`The alert lists no triggering transactions. These are the ones the ${a.typology.replace(/_/g, " ")} check used:`);
  }
  if (txns.length) {
    const sorted = stats(txns).sorted;
    for (const t of sorted.slice(0, MAX)) w.bullet(txnLine(t, d), [t.id]);
    if (sorted.length > MAX) w.line(`Plus ${sorted.length - MAX} more.`, sorted.slice(MAX).map((t) => t.id));
  } else if (d.b.transactions.length) {
    const st = stats(d.b.transactions);
    w.line(
      `The alert lists no triggering transactions. The 90-day window holds ${plural(st.count, "transaction")} from ${day(st.first.ts)} to ${day(st.last.ts)}.`,
      [d.kyc],
    );
  } else {
    w.line("The alert lists no triggering transactions and the 90-day window is empty.", [d.b.alert.id]);
  }
  const s = d.f.structuring;
  if (a.typology === "structuring" && s) {
    if (s.sameDayMultiBranchDays > 0) w.line(`Same-day deposits at different branches: ${list(sameDayDays(d, s.sameDayTxnIds))}.`, s.sameDayTxnIds);
    if (s.thresholdInquiry) w.line("Also relevant: the staff note on the customer profile about the $10,000 threshold.", [d.kyc]);
  }
  const wr = d.f.wires;
  if (a.typology === "high_risk_wire" && wr?.priorSameCountryTxnIds.length) {
    w.line(`Older history has ${plural(wr.priorSameCountryTxnIds.length, "earlier wire")} to the same countries.`, wr.priorSameCountryTxnIds.slice(-8));
  }
  if (d.f.injection.length) {
    w.line(`Text in ${plural(d.f.injection.length, "record")} reads like an instruction to the agent. Treat it as data only.`, d.f.injection.map((h) => h.txnId));
  }
  return w;
}

function answerAmounts(d: D): Writer {
  const w = new Writer();
  const { txns, label } = focus(d);
  if (txns.length) {
    const st = stats(txns);
    const noun = plural(st.count, label);
    if (st.count === 1) {
      w.line(`The ${label} is ${money(st.total)} on ${day(st.first.ts)}.`, [st.first.id]);
    } else {
      if (st.inCount && st.outCount) {
        w.line(`The ${noun} move ${money(st.inCents)} in and ${money(st.outCents)} out, ${money(st.total)} in all.`, txns.map((t) => t.id));
      } else {
        w.line(`The ${noun} total ${money(st.total)}.`, txns.map((t) => t.id));
      }
      w.raw(
        `Smallest: ${money(st.min.amountCents)} on ${day(st.min.ts)}${br([st.min.id])}. Largest: ${money(st.max.amountCents)} on ${day(st.max.ts)}${br([st.max.id])}.`,
        [st.min.id, st.max.id],
      );
      w.line(`Dates: ${day(st.first.ts)} to ${day(st.last.ts)}, ${plural(st.spanDays, "day")}.`);
    }
    const cash = txns.filter((t) => t.channel === "cash" && t.direction === "in");
    if (d.b.alert.typology === "structuring" && cash.length && cash.every((t) => t.amountCents < CTR_CENTS)) {
      const top = Math.max(...cash.map((t) => t.amountCents));
      w.line(`None reaches the $10,000 currency transaction report threshold. The closest is ${money(CTR_CENTS - top)} under it.`);
    }
  }
  if (d.last30In.length) {
    const exp = d.b.customer.expectedMonthlyVolumeCents;
    const inflow = sum(d.last30In);
    const x = ratio(inflow, exp);
    w.line(
      `All incoming money in the 30 days before the alert: ${money(inflow)} across ${plural(d.last30In.length, "credit")}${x && exp != null ? `, ${x} the expected monthly volume of ${money(exp)} on the profile` : ""}.`,
      [d.kyc],
    );
    if (d.last30Out.length) w.line(`Outgoing in the same 30 days: ${money(sum(d.last30Out))} across ${plural(d.last30Out.length, "debit")}.`);
  }
  if (!w.lines.length) w.line("There are no transactions in the file to total.", [d.b.alert.id]);
  return w;
}

function answerPrior(d: D): Writer {
  const w = new Writer();
  const cases = [...d.b.priorCases].sort((a, b) => ms(b.openedAt) - ms(a.openedAt));
  if (!cases.length) {
    w.line("No prior alerts or SARs on file for this customer.", [d.kyc]);
    return w;
  }
  const sars = cases.filter((c) => c.kind === "sar").length;
  w.line(`${plural(cases.length, "prior case")} on file: ${plural(cases.length - sars, "alert")} and ${plural(sars, "SAR")}.`);
  for (const c of cases.slice(0, 8)) w.bullet(`${c.kind === "sar" ? "SAR" : "Alert"} opened ${day(c.openedAt)}, ${c.outcome}: ${c.summary.replace(/\.$/, "")}.`, [c.id]);
  if (!sars) w.line("None of them is a SAR.");
  return w;
}

function answerWatchlist(d: D): Writer {
  const w = new Writer();
  const hits = d.f.watchlistHits;
  const cps = uniq(d.b.transactions.map((t) => t.counterpartyName).filter((n): n is string => !!n));
  if (!hits.length) {
    w.line(
      `No match. The customer name and ${plural(cps.length, "counterparty name")} were screened against ${plural(d.b.watchlist.length, "watchlist entry", "watchlist entries")}, and none scored 0.80 or higher.`,
      [d.kyc],
    );
  } else {
    const lists = new Map(d.b.watchlist.map((x) => [x.id, x.listName]));
    w.line(`${plural(hits.length, "watchlist candidate")} at or above 0.80 similarity:`);
    for (const h of hits.slice(0, 5)) {
      w.bullet(
        `${h.matchedOn === "customer" ? "Customer" : "Counterparty"} "${h.matchedName}" vs "${h.watchlistName}"${lists.get(h.watchlistId) ? ` (${lists.get(h.watchlistId)})` : ""}, similarity ${h.similarity.toFixed(2)}${h.countryMatch === true ? ", country matches" : h.countryMatch === false ? ", country differs" : ""}.`,
        [h.watchlistId, h.txnId ?? d.kyc],
      );
    }
    const p2 = d.r.policyHits.find((h) => /^P2\b/.test(h.rule));
    if (p2) w.line(`Policy sent it to L2: ${p2.detail}`, p2.recordIds);
  }
  w.line("The agent never clears a watchlist match. A sanctions analyst does.");
  return w;
}

function answerProfile(d: D): Writer {
  const w = new Writer();
  const c = d.b.customer;
  const tenure = c.onboardedAt ? Math.max(1, Math.round((d.asOf - ms(c.onboardedAt)) / (30 * DAY_MS))) : null;
  w.line(
    `${c.name}: ${c.kind}, ${c.occupation ?? "occupation not recorded"}, ${c.onboardedAt && tenure ? `customer since ${day(c.onboardedAt)} (${plural(tenure, "month")})` : "onboarding date not recorded"}, risk rating ${c.riskRating}, country ${c.country}.`,
    [c.id],
  );
  w.line(c.expectedMonthlyVolumeCents != null ? `Expected monthly volume on file: ${money(c.expectedMonthlyVolumeCents)}.` : "No expected monthly volume on file.", [c.id]);
  if (d.last30In.length) {
    const inflow = sum(d.last30In);
    const x = ratio(inflow, c.expectedMonthlyVolumeCents);
    w.line(`Actual incoming money in the 30 days before the alert: ${money(inflow)} from ${plural(d.last30In.length, "credit")}${x ? `, ${x} expected` : ""}.`, [c.id]);
  }
  const note = staffNote(d);
  if (note) w.line(`Staff note: "${note}"`, [c.id]);
  if (d.b.history.length) {
    const st = stats(d.b.history);
    w.line(`Older history in the file: ${plural(st.count, "transaction")} back to ${day(st.first.ts)}.`);
  }
  return w;
}

function answerCounterfactual(d: D): Writer {
  const w = new Writer();
  const r = d.r;
  const a = d.b.alert;
  const p2 = r.policyHits.find((h) => /^P2\b/.test(h.rule));

  if (r.outcome === "locked") {
    w.line(
      "Nothing in the evidence would change this. Customer-supplied text reads like an instruction to the agent, so policy keeps the model away from the case and an analyst reviews it directly.",
      d.f.injection.map((h) => h.txnId).concat(r.policyHits.flatMap((h) => h.recordIds)),
    );
    return w;
  }
  if (r.outcome === "abstained") {
    const hit = r.policyHits.find((h) => /^P3\b/.test(h.rule));
    w.line(
      `More data would. The agent abstained with ${plural(d.b.transactions.length, "transaction")} in the window and ${Math.round(d.f.dataCompleteness * 100)}% profile completeness. With enough transactions and the occupation, onboarding date and expected volume on file, it would assess the alert.`,
      hit?.recordIds.length ? hit.recordIds : [d.kyc],
    );
    return w;
  }
  if (p2) {
    w.line(`Nothing the model concludes can change this. ${p2.detail}`, p2.recordIds);
    return w;
  }

  const rec = r.recommendation;
  switch (a.typology) {
    case "structuring": {
      const s = d.f.structuring;
      if (!s) break;
      const parts: string[] = [];
      const ids: string[] = [];
      if (s.thresholdInquiry) {
        parts.push(`the staff note about the $10,000 threshold${br([d.kyc])}`);
        ids.push(d.kyc);
      }
      if (s.sameDayMultiBranchDays > 0) {
        parts.push(`the deposits at different branches on the same day${br(s.sameDayTxnIds)}`);
        ids.push(...s.sameDayTxnIds);
      }
      if (parts.length) {
        w.raw(
          `Without ${list(parts)}, the structuring check has no evasion indicator. Amounts alone do not require a structuring SAR under FinCEN's October 2025 FAQ, so the agent would not escalate. It would send the alert to an analyst for review.`,
          ids,
        );
        if (parts.length > 1) w.line("Removing only one of them would leave the other in place, so the recommendation would most likely stay escalate.");
        const v = volumeFact(d);
        if (v) w.line(`${v.text.replace(/\.$/, "")}. That is worth noting, but it is not an evasion indicator on its own.`, v.ids);
      } else {
        w.line(
          "An evasion indicator would change it: a staff note showing interest in the reporting threshold, or deposits at different branches on the same day. The file has neither today.",
          [d.kyc, ...s.txnIds],
        );
      }
      return w;
    }
    case "funnel_account": {
      const x = d.f.funnel;
      if (!x) break;
      const pct = Math.round(x.passThroughRatio * 100);
      if (rec === "escalate") {
        w.line(
          `The escalation rests on pass-through: ${pct}% of pooled credits from ${plural(x.distinctSenders, "sender")} left by wire within ${plural(x.maxHoursToOutbound, "hour")}. If well under 70% had left, or the credits came from only a few senders, the agent would not call it a funnel pattern.`,
          [...x.outboundTxnIds, ...x.inboundTxnIds.slice(0, 4)],
        );
      } else {
        w.line(
          `An outbound wire carrying most of the ${money(x.inboundCents)} in pooled credits out within days would change it to escalate. Today ${x.outboundTxnIds.length ? `${pct}% left by wire` : "no money left by wire"}.`,
          x.outboundTxnIds.length ? x.outboundTxnIds : x.inboundTxnIds.slice(0, 6),
        );
      }
      return w;
    }
    case "high_risk_wire": {
      const x = d.f.wires;
      if (!x) break;
      if (x.documentedRelationship) {
        w.line(
          `Without the ${plural(x.priorSameCountryTxnIds.length, "earlier wire")} to the same country and the supplier relationship on the profile, these would be first-time wires to a high-risk country with no documented purpose, and the agent would escalate.`,
          [...x.priorSameCountryTxnIds.slice(-6), d.kyc],
        );
      } else {
        w.line(
          "A documented supplier or trading relationship on the profile, backed by a history of earlier wires to the same country, would support a close. The file has neither today.",
          [...x.highRiskTxnIds, d.kyc],
        );
      }
      return w;
    }
    case "sanctions_name": {
      const h = d.f.watchlistHits[0];
      if (!h) break;
      w.line(
        rec === "close" || rec === "human_review"
          ? `A matching country, or a closer name match, would change it to escalate. Today the score is ${h.similarity.toFixed(2)} and the country ${h.countryMatch === false ? "differs" : "is not confirmed"}.`
          : `A clearly different country and a weaker name match would point toward a false match, but the agent never clears a watchlist hit. A sanctions analyst does.`,
        [h.watchlistId, h.txnId ?? d.kyc],
      );
      return w;
    }
    case "payroll_pattern": {
      const p = d.f.payroll;
      if (!p) break;
      w.line(
        `A break in the ${p.cadenceDays ?? "regular"}-day pay cadence, per-payee amounts that swing by more than about 15% (today ${(p.amountCv * 100).toFixed(1)}%), or a profile that is not a business would remove the payroll explanation.`,
        [...p.txnIds.slice(0, 6), d.kyc],
      );
      return w;
    }
    case "seasonal_cash": {
      const s = d.f.seasonal;
      if (!s) break;
      w.line(
        s.priorYearsMatch
          ? "If the same window in prior years had not shown a similar spike, seasonality would not explain the volume and the agent would escalate."
          : "Prior-year windows within about a third of this one would support a seasonal explanation and a close.",
        [...s.priorYearTxnIds.flat().slice(0, 6), d.kyc],
      );
      return w;
    }
  }
  const v = volumeFact(d);
  w.line(
    rec === "escalate"
      ? "Inflows closer to the expected monthly volume on the profile, or a documented reason for the extra money, would move this toward a close."
      : "Inflows well above the expected monthly volume with no documented reason would move this toward escalation.",
    [d.kyc],
  );
  if (v) w.line(v.text, v.ids);
  return w;
}

function answerPolicy(d: D): Writer {
  const w = new Writer();
  const r = d.r;
  if (r.policyHits.length) {
    w.line(`${plural(r.policyHits.length, "policy rule")} applied:`);
    for (const h of r.policyHits) w.bullet(`${h.rule}. ${h.detail}`, h.recordIds.length ? h.recordIds : [d.b.alert.id]);
  } else {
    w.line(`No policy rule fired on this alert. The final recommendation (${verdict(r)}) is the model's own.`, [d.b.alert.id]);
  }
  w.line(`Never automated, whatever the policy: ${list(NEVER_AUTOMATED.map((x) => x.charAt(0).toLowerCase() + x.slice(1)))}.`);
  return w;
}

function nextSteps(d: D): string[][] {
  const r = d.r;
  const { txns, label } = focus(d);
  const ids = txns.map((t) => t.id);
  const steps: [string, string[]][] = [];
  const note = staffNote(d);
  const profileStep: [string, string[]] = d.f.structuring?.thresholdInquiry
    ? ["Read the staff note on the profile and confirm who wrote it and when.", [d.kyc]]
    : note
      ? ["Read the notes on the profile and check whether they explain the activity.", [d.kyc]]
    : [`Compare the activity with the profile: ${d.b.customer.occupation ?? "occupation not recorded"}, expected volume ${d.b.customer.expectedMonthlyVolumeCents != null ? `${money(d.b.customer.expectedMonthlyVolumeCents)} a month` : "not recorded"}.`, [d.kyc]];

  if (r.outcome === "locked") {
    steps.push(["Read the flagged text as data only. It reads like an instruction to the agent and may itself be relevant to the review.", d.f.injection.map((h) => h.txnId)]);
    if (ids.length) steps.push([`Review the ${plural(ids.length, label)} yourself. The model never saw this case.`, ids]);
    steps.push(profileStep);
    steps.push(["Decide close or escalate, with a note for the audit log.", []]);
  } else if (r.outcome === "abstained" || r.outcome === "error") {
    steps.push([r.outcome === "error" ? "Run the agent again, or review the alert manually." : `The file is thin: ${plural(d.b.transactions.length, "transaction")} in the window and ${Math.round(d.f.dataCompleteness * 100)}% profile completeness.`, [d.kyc]]);
    steps.push(["Fill gaps from internal sources your procedures allow: occupation, onboarding date and expected volume.", [d.kyc]]);
    steps.push(["Decide close or escalate, with a note for the audit log.", []]);
  } else if (r.recommendation === "escalate") {
    if (ids.length) steps.push([`Confirm the ${plural(ids.length, label)} in the core system: amounts, dates and locations.`, ids]);
    steps.push(profileStep);
    if (d.b.priorCases.length) steps.push([`Check the ${plural(d.b.priorCases.length, "prior case")} for context.`, d.b.priorCases.map((c) => c.id)]);
    if (d.f.watchlistHits.length) steps.push(["Leave the watchlist candidate for the sanctions analyst. Do not clear it here.", d.f.watchlistHits.map((h) => h.watchlistId)]);
    steps.push(["If the records support it, accept the escalation. If they show a documented, legitimate explanation, override with a reason code and a note.", []]);
    steps.push(["The L2 investigator decides whether the activity is suspicious and whether to file a SAR.", []]);
  } else if (r.recommendation === "close") {
    steps.push(["Confirm the facts behind the close in the cited records.", uniq(r.rationale.flatMap((x) => x.citations)).slice(0, 8)]);
    steps.push(profileStep);
    steps.push(["Accept the close, or escalate with a reason code if something in the records does not fit.", []]);
  } else {
    if (r.modelRecommendation) steps.push([`The model leaned ${r.modelRecommendation.replace(/_/g, " ")}, but policy sent it to you: ${r.policyHits.map((h) => h.rule).join("; ") || "no rule recorded"}.`, r.policyHits.flatMap((h) => h.recordIds)]);
    if (ids.length) steps.push([`Review the ${plural(ids.length, label)}.`, ids]);
    steps.push(profileStep);
    steps.push(["Decide close or escalate, with a reason code and a note for the audit log.", []]);
  }
  return steps.map(([t, i]) => [t, ...i]);
}

function answerNext(d: D, intent: Intent): Writer {
  const w = new Writer();
  if (intent === "sar_decision") {
    w.line("Neither this assistant nor the agent decides whether to file a SAR. An L2 investigator makes that call.");
    w.line(
      `Your part at L1 is to accept or override the agent's recommendation (${verdict(d.r)}) with a reason code. If the alert is escalated, the SAR clock starts when the investigator determines the activity is suspicious, not when the alert fired.`,
      [d.b.alert.id],
    );
    return w;
  }
  if (intent === "contact") {
    w.line("Assay never suggests contacting the customer about an alert. Telling a customer that a SAR may be filed is prohibited, so keep the review to the records in this file and internal sources your procedures allow.");
    w.line("From the records:");
  }
  nextSteps(d).forEach(([text, ...ids], i) => w.line(`${i + 1}. ${text}`, ids));
  if (intent !== "contact") w.line("Do not discuss the alert with the customer.");
  return w;
}

function answerFallback(d: D): Writer {
  const w = new Writer();
  w.line(
    `I answer from this alert's records only. I can explain why the agent's call is "${verdict(d.r)}", list the transactions that matter, give totals and date ranges, cover prior cases and SARs, watchlist screening and the customer profile, say what would change the recommendation, list the policy rules applied, and suggest next steps for you.`,
    [d.b.alert.id],
  );
  w.line("Try one of the suggested questions, or add your own model key for open-ended questions.");
  return w;
}

/* --------------------------------- Routing -------------------------------- */

export type Intent =
  | "contact"
  | "sar_decision"
  | "counterfactual"
  | "next"
  | "watchlist"
  | "prior"
  | "policy"
  | "profile"
  | "amounts"
  | "evidence"
  | "why"
  | "fallback";

const RULES: [Intent, RegExp][] = [
  ["contact", /\b(contact|call|phone|email|e-mail|text|reach out to|message|talk to|speak (to|with)|ask)\b[^?]*\b(customer|client|account holder|subject)\b/i],
  ["sar_decision", /\b(should|must|need to|do|can) (i|we)\b[^?]*\b(file|report)\b|\bfile (a |the )?sars?\b|\bsar (decision|filing)\b|\bis (this|it) (a )?sar\b/i],
  ["counterfactual", /\bwhat would\b|\bwhat if\b|\bwould (it|this|that|the)\b[^?]*\b(change|flip|differ)|\bwithout\b|\bchange (the|its|your|this) (recommendation|call|outcome|decision|mind)|\bflip\b|\bcounterfactual|\bdifferent (outcome|recommendation|call)|\bunless\b/i],
  ["next", /\bnext\b|\bshould i\b|\bwhat (do|should|can) (i|we)\b|\bsteps?\b|\bto do\b|\bchecklist\b|\binvestigat|\bverify\b|\bfollow[- ]?up\b|\bhow (do|should) (i|we) (review|handle|proceed)/i],
  ["watchlist", /watch ?list|sanction|\bofac\b|\bsdn\b|\bpep\b|name (match|screen)|\bscreen(ed|ing)?\b/i],
  ["prior", /\bprior\b|\bprevious(ly)?\b|\b(past|earlier|other|older) (alerts?|cases?|sars?)\b|\b(alerts?|cases?|sars?) before\b|\bcase history\b|\bsars?\b/i],
  ["policy", /\bpolic(y|ies)\b|\bguardrails?\b|\brules? (applied|fired)\b|\bp[1-6]\b|\bautonomy\b|confidence floor|\blocked\b|\babstain/i],
  ["profile", /\bkyc\b|\bprofile\b|\boccupation\b|\bexpected\b|\bwho is\b|\bwho's\b|\babout the (customer|client)\b|\brisk rating\b|\bonboard|\bjob\b|\bincome\b|\bstaff note\b|\bnotes?\b/i],
  ["amounts", /\btotal\b|\bsum\b|\bhow much\b|\bamounts?\b|\blargest\b|\bsmallest\b|\bbiggest\b|\bmin(imum)?\b|\bmax(imum)?\b|\bdollars?\b|\$|\bdate range\b|\bhow many\b|\bvolume\b/i],
  ["evidence", /\btransactions?\b|\bdeposits?\b|\bevidence\b|\btrigger|\brecords?\b|\bwires?\b|\bbranch(es)?\b|\bpayments?\b|\bwhich\b|\bshow me\b|\bactivity\b|\bcredits?\b/i],
  ["why", /\bwhy\b|\breason|\brecommend|\bescalat|\bclos(e|ed|ing)\b|\bverdict\b|\bconfiden|\brisk score\b|\bexplain\b|\bsummar|\bdecision\b|\bjustif|\bcall\b/i],
  ["profile", /\bcustomer\b|\bclient\b|\bwho\b/i],
];

export function detectIntent(question: string): Intent {
  const q = question.trim();
  if (!q) return "fallback";
  for (const [intent, re] of RULES) if (re.test(q)) return intent;
  return "fallback";
}

export function answerOffline(question: string, ctx: AskContext): AskAnswer {
  const d = derive(ctx);
  const intent = detectIntent(question);
  const w =
    intent === "why"
      ? answerWhy(d)
      : intent === "evidence"
        ? answerEvidence(d)
        : intent === "amounts"
          ? answerAmounts(d)
          : intent === "prior"
            ? answerPrior(d)
            : intent === "watchlist"
              ? answerWatchlist(d)
              : intent === "profile"
                ? answerProfile(d)
                : intent === "counterfactual"
                  ? answerCounterfactual(d)
                  : intent === "policy"
                    ? answerPolicy(d)
                    : intent === "next" || intent === "sar_decision" || intent === "contact"
                      ? answerNext(d, intent)
                      : answerFallback(d);

  const known = knownRecordIds(ctx.bundle);
  let citations = uniq(w.ids).filter((id) => known.has(id));
  if (!citations.length) citations = [ctx.bundle.alert.id];
  return { answer: w.lines.join("\n"), citations, source: "offline" };
}
