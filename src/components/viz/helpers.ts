/**
 * Pure helpers for the viz components. No React, no DOM, so they can be unit tested.
 * All money is integer cents. All dates are formatted in UTC so server and client
 * renders agree.
 */

export type Channel = "cash" | "wire" | "ach" | "p2p" | "card" | "check";

export interface VizTxn {
  id: string;
  ts: string;
  amountCents: number;
  direction: "in" | "out";
  channel: Channel;
  counterpartyName: string | null;
  branch: string | null;
}

export interface VizTxnWithCountry extends VizTxn {
  counterpartyCountry: string | null;
}

export const DAY_MS = 86_400_000;

export const CHANNEL_LABEL: Record<Channel, string> = {
  cash: "Cash",
  wire: "Wire",
  ach: "ACH",
  p2p: "P2P",
  card: "Card",
  check: "Check",
};

/** CTR filing threshold and the band below it that makes the guide worth drawing. */
export const CTR_CENTS = 1_000_000;
export const CTR_BAND_LOW_CENTS = 800_000;

/* ---------------- formatting ---------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Full amount for tooltips and tables: "$9,400" or "$9,412.50". */
export function formatUsd(cents: number): string {
  const v = Math.abs(cents) / 100;
  const whole = Math.round(cents) % 100 === 0;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** Compact amount for axis ticks: "$250", "$5k", "$2.5k", "$1.2M". */
export function formatCompactUsd(cents: number): string {
  const d = Math.abs(cents) / 100;
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (d >= 1_000_000) return `$${trim(d / 1_000_000)}M`;
  if (d >= 1_000) return `$${trim(d / 1_000)}k`;
  return `$${Math.round(d)}`;
}

/** "Sep 16, 2026" in UTC. */
export function formatDate(iso: string | number): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Sep 16, 2026, 14:05 UTC". */
export function formatDateTime(iso: string | number): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hh}:${mm} UTC`;
}

export function truncate(s: string, max = 18): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------- scales ---------------- */

const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Smallest "nice" number >= v (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 times a power of ten). */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  for (const s of NICE_STEPS) if (m <= s + 1e-9) return s * p;
  return 10 * p;
}

/** Round to one significant digit, used for interior tick values. */
export function roundOneSig(v: number): number {
  if (!(v > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.round(v / p) * p;
}

/** Maps [0, domainMax] to [0, rangeMax] on a square-root scale. Values are clamped. */
export function sqrtScale(domainMax: number, rangeMax: number): (v: number) => number {
  const d = domainMax > 0 ? domainMax : 1;
  return (v: number) => Math.sqrt(Math.min(Math.max(v, 0), d) / d) * rangeMax;
}

/**
 * Domain and three ticks for the timeline's amount axis, in cents. The top tick is the
 * domain edge; the other two sit near 1/3 and 2/3 of the way up in sqrt space, rounded
 * to clean numbers.
 */
export function amountAxis(maxCents: number, opts: { includeCtr?: boolean } = {}) {
  const target = Math.max(maxCents, opts.includeCtr ? CTR_CENTS * 1.15 : 0, 100_00);
  const domain = niceCeil(target / 100) * 100;
  const ticks = [roundOneSig(domain / 9), roundOneSig((domain * 4) / 9), domain].filter(
    (t, i, a) => t > 0 && a.indexOf(t) === i,
  );
  return { domain, ticks };
}

/* ---------------- time ---------------- */

export interface Window {
  startMs: number;
  endMs: number;
}

export function windowBefore(alertCreatedAt: string, days = 90): Window {
  const endMs = new Date(alertCreatedAt).getTime();
  return { startMs: endMs - days * DAY_MS, endMs };
}

export function inWindow<T extends { ts: string; id: string }>(txns: T[], w: Window): T[] {
  return txns
    .filter((t) => {
      const ms = new Date(t.ts).getTime();
      return ms >= w.startMs && ms <= w.endMs;
    })
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime() || a.id.localeCompare(b.id));
}

/** First-of-month ticks (UTC) inside the window. The label carries the year on January. */
export function monthTicks(w: Window): { ms: number; label: string }[] {
  const out: { ms: number; label: string }[] = [];
  const s = new Date(w.startMs);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth() + 1;
  for (let guard = 0; guard < 240; guard++) {
    if (m > 11) {
      m = 0;
      y++;
    }
    const ms = Date.UTC(y, m, 1);
    if (ms > w.endMs) break;
    if (ms >= w.startMs) out.push({ ms, label: m === 0 ? `${MONTHS[m]} ${y}` : MONTHS[m] });
    m++;
  }
  return out;
}

/** True when a cash inflow sits in the $8,000 to $10,000 band, the case for drawing the CTR guide. */
export function hasNearCtrCash(txns: VizTxn[]): boolean {
  return txns.some(
    (t) => t.channel === "cash" && t.direction === "in" && t.amountCents >= CTR_BAND_LOW_CENTS && t.amountCents <= CTR_CENTS,
  );
}

/** Who or where a transaction touched, for tooltips and tables. */
export function partyLabel(t: Pick<VizTxn, "channel" | "counterpartyName" | "branch">): string {
  if (t.counterpartyName && t.counterpartyName.trim()) return t.counterpartyName.trim();
  if (t.channel === "cash") return t.branch ? `Cash at ${t.branch}` : "Cash, location unknown";
  if (t.branch) return t.branch;
  return `Unnamed ${CHANNEL_LABEL[t.channel]} party`;
}

/** "Wire, Gulf Trade FZE" or, for unnamed cash, just "Cash at Westheimer". */
export function channelAndParty(t: Pick<VizTxn, "channel" | "counterpartyName" | "branch">): string {
  const party = partyLabel(t);
  if (t.channel === "cash" && !(t.counterpartyName && t.counterpartyName.trim())) return party;
  return `${CHANNEL_LABEL[t.channel]}, ${party}`;
}

/* ---------------- counterparty aggregation ---------------- */

export interface CounterpartyNode {
  key: string;
  label: string;
  inCents: number;
  outCents: number;
  totalCents: number;
  inCount: number;
  outCount: number;
  count: number;
  country: string | null;
  highRisk: boolean;
  highlighted: boolean;
  txnIds: string[];
  /** Set on the folded "Other (n)" node: how many counterparties it holds. */
  folded?: number;
}

/**
 * Aggregates transactions by counterparty. Cash with no named counterparty is grouped
 * by location; other unnamed activity by branch. High-risk and highlighted
 * counterparties are kept ahead of volume so evidence never folds into "Other".
 * Output order is deterministic: kept nodes by total desc then label, then "Other".
 */
export function aggregateCounterparties(
  txns: VizTxnWithCountry[],
  opts: { highRiskCountries?: string[]; highlightedIds?: string[]; maxNodes?: number } = {},
): CounterpartyNode[] {
  const risky = new Set((opts.highRiskCountries ?? []).map((c) => c.toUpperCase()));
  const lit = new Set(opts.highlightedIds ?? []);
  const maxNodes = Math.max(1, opts.maxNodes ?? 18);
  const map = new Map<string, CounterpartyNode>();

  for (const t of txns) {
    const label = partyLabel(t);
    const key = label.toLowerCase();
    let n = map.get(key);
    if (!n) {
      n = {
        key,
        label,
        inCents: 0,
        outCents: 0,
        totalCents: 0,
        inCount: 0,
        outCount: 0,
        count: 0,
        country: null,
        highRisk: false,
        highlighted: false,
        txnIds: [],
      };
      map.set(key, n);
    }
    const amt = Math.abs(t.amountCents);
    if (t.direction === "in") {
      n.inCents += amt;
      n.inCount++;
    } else {
      n.outCents += amt;
      n.outCount++;
    }
    n.totalCents += amt;
    n.count++;
    n.txnIds.push(t.id);
    const cc = t.counterpartyCountry ? t.counterpartyCountry.toUpperCase() : null;
    if (cc && (!n.country || (risky.has(cc) && !risky.has(n.country)))) n.country = cc;
    if (cc && risky.has(cc)) n.highRisk = true;
    if (lit.has(t.id)) n.highlighted = true;
  }

  const byVolume = (a: CounterpartyNode, b: CounterpartyNode) => b.totalCents - a.totalCents || a.label.localeCompare(b.label);
  const all = [...map.values()].sort(byVolume);
  if (all.length <= maxNodes) return all;

  const priority = (n: CounterpartyNode) => (n.highRisk || n.highlighted ? 0 : 1);
  const ranked = [...all].sort((a, b) => priority(a) - priority(b) || byVolume(a, b));
  const keep = ranked.slice(0, maxNodes - 1).sort(byVolume);
  const rest = ranked.slice(maxNodes - 1);
  const other: CounterpartyNode = {
    key: "__other__",
    label: `Other (${rest.length})`,
    inCents: 0,
    outCents: 0,
    totalCents: 0,
    inCount: 0,
    outCount: 0,
    count: 0,
    country: null,
    highRisk: false,
    highlighted: false,
    txnIds: [],
    folded: rest.length,
  };
  for (const n of rest) {
    other.inCents += n.inCents;
    other.outCents += n.outCents;
    other.totalCents += n.totalCents;
    other.inCount += n.inCount;
    other.outCount += n.outCount;
    other.count += n.count;
    other.txnIds.push(...n.txnIds);
    if (n.highlighted) other.highlighted = true;
  }
  return [...keep, other];
}

/** Vertical room the radial layout needs so labels on the busier side never touch. */
export function radialSpec(nodes: CounterpartyNode[], opts: { minGap?: number; minRy?: number } = {}) {
  const minGap = opts.minGap ?? 32;
  const left = nodes.filter((d) => d.inCents >= d.outCents).length;
  const right = nodes.length - left;
  const busiest = Math.max(left, right, 1);
  // Nodes use the middle 80% of the ellipse's height, so 1.6 * ry spreads busiest - 1 gaps.
  const ry = Math.max(opts.minRy ?? 150, (minGap * (busiest - 1)) / 1.6);
  const gap = busiest > 1 ? Math.min(72, (1.6 * ry) / (busiest - 1)) : 72;
  return { ry, gap, left, right };
}

/**
 * Deterministic radial layout around the customer. Counterparties that mostly send
 * money to the customer sit on the left arc, those that mostly receive sit on the
 * right, each arc ordered by volume from the top. Each arc is spaced evenly in y (so
 * outward labels never collide) and bent onto an ellipse. Angle is in radians, SVG
 * convention (y down), measured from the centre.
 */
export function radialLayout(
  nodes: CounterpartyNode[],
  center: { x: number; y: number },
  radius: { x: number; y: number },
  maxGap = 72,
): { node: CounterpartyNode; x: number; y: number; angle: number; side: "left" | "right" }[] {
  if (nodes.length === 0) return [];
  const left = nodes.filter((d) => d.inCents >= d.outCents);
  const right = nodes.filter((d) => d.inCents < d.outCents);
  const arc = (list: CounterpartyNode[], side: "left" | "right") => {
    const n = list.length;
    const gap = n > 1 ? Math.min(maxGap, (1.6 * radius.y) / (n - 1)) : 0;
    return list.map((node, i) => {
      const dy = (i - (n - 1) / 2) * gap;
      const k = Math.sqrt(Math.max(0, 1 - (dy / radius.y) ** 2));
      const x = center.x + (side === "left" ? -1 : 1) * radius.x * k;
      const y = center.y + dy;
      return { node, x, y, angle: Math.atan2(y - center.y, x - center.x), side };
    });
  };
  return [...arc(left, "left"), ...arc(right, "right")];
}
