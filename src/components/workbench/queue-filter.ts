/**
 * Queue filtering, sorting and URL round-tripping. Pure: no React, no DOM.
 * The server queue page and the in-browser demo share these rules so a saved
 * view or a pasted link shows the same alerts in both.
 */
import type { AlertStatus, Recommendation, Typology } from "@/lib/db/schema";

export type RiskBand = "all" | "high" | "medium" | "low";
export type QueueSort = "risk" | "age" | "sla" | "confidence";

export interface QueueFilterState {
  /** Free text: customer name, alert id or rule code, case-insensitive. */
  q: string;
  status: string[];
  typology: string[];
  /** "close" | "escalate" | "human_review", or "none" for alerts the agent has not triaged. */
  recommendation: string[];
  /** "me" | "unassigned" | a user id. */
  assignee: string[];
  risk: RiskBand;
  sort: QueueSort;
  /** Only alerts whose internal SLA falls due within this many days (overdue included). Null for no limit. */
  dueWithinDays: number | null;
}

export interface FilterableRow {
  id: string;
  customerName: string;
  ruleCode: string;
  typology: string;
  status: string;
  recommendation: string | null;
  riskScore: number | null;
  confidence: number | null;
  assigneeId?: string | null;
  createdAt: string | Date;
  slaDueAt: string | Date;
}

export interface FilterContext {
  currentUserId?: string;
  now: Date;
}

export const DEFAULT_FILTERS: QueueFilterState = Object.freeze({
  q: "",
  status: [],
  typology: [],
  recommendation: [],
  assignee: [],
  risk: "all",
  sort: "risk",
  dueWithinDays: null,
}) as QueueFilterState;

export const STATUS_VALUES: readonly AlertStatus[] = ["new", "triaged", "locked", "closed", "escalated", "sar_filed", "no_sar"];
export const TYPOLOGY_VALUES: readonly Typology[] = ["structuring", "funnel_account", "high_risk_wire", "sanctions_name", "payroll_pattern", "seasonal_cash", "other"];
export const RECOMMENDATION_VALUES: readonly (Recommendation | "none")[] = ["close", "escalate", "human_review", "none"];
export const RISK_VALUES: readonly RiskBand[] = ["all", "high", "medium", "low"];
export const SORT_VALUES: readonly QueueSort[] = ["risk", "age", "sla", "confidence"];

export const RISK_LABEL: Record<RiskBand, string> = {
  all: "Any risk",
  high: "High risk (70 and up)",
  medium: "Medium risk (40 to 69)",
  low: "Low risk (under 40)",
};

export const SORT_LABEL: Record<QueueSort, string> = {
  risk: "Highest risk first",
  age: "Oldest first",
  sla: "SLA due soonest",
  confidence: "Highest confidence first",
};

/** Risk bands: high at 70 and above, medium 40 to 69, low under 40. Null scores have no band. */
export function riskBand(score: number | null | undefined): Exclude<RiskBand, "all"> | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const DAY = 86_400_000;

function matchesAssignee(row: FilterableRow, wanted: string[], ctx: FilterContext): boolean {
  const a = row.assigneeId ?? null;
  return wanted.some((w) => {
    if (w === "unassigned") return !a;
    if (w === "me") return !!ctx.currentUserId && a === ctx.currentUserId;
    return a === w;
  });
}

/** True when `row` passes every filter in `f` (sorting aside). */
export function rowMatches(row: FilterableRow, f: QueueFilterState, ctx: FilterContext): boolean {
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = `${row.customerName}\u0000${row.id}\u0000${row.ruleCode}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.status.length && !f.status.includes(row.status)) return false;
  if (f.typology.length && !f.typology.includes(row.typology)) return false;
  if (f.recommendation.length && !f.recommendation.includes(row.recommendation ?? "none")) return false;
  if (f.assignee.length && !matchesAssignee(row, f.assignee, ctx)) return false;
  if (f.risk !== "all" && riskBand(row.riskScore) !== f.risk) return false;
  if (f.dueWithinDays != null && ms(row.slaDueAt) - ctx.now.getTime() > f.dueWithinDays * DAY) return false;
  return true;
}

/** Larger first, nulls last. */
const descNullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);

export function compareRows(a: FilterableRow, b: FilterableRow, sort: QueueSort): number {
  let c = 0;
  if (sort === "risk") c = descNullsLast(a.riskScore, b.riskScore);
  else if (sort === "age") c = ms(a.createdAt) - ms(b.createdAt);
  else if (sort === "sla") c = ms(a.slaDueAt) - ms(b.slaDueAt);
  else if (sort === "confidence") c = descNullsLast(a.confidence, b.confidence);
  if (c) return c;
  // Stable, meaningful tie-break: riskier first, then id.
  return descNullsLast(a.riskScore, b.riskScore) || a.id.localeCompare(b.id);
}

/** Filters and sorts a copy of `rows`. The input array is not changed. */
export function applyQueueFilters<T extends FilterableRow>(rows: readonly T[], f: QueueFilterState, ctx: FilterContext): T[] {
  return rows.filter((r) => rowMatches(r, f, ctx)).sort((a, b) => compareRows(a, b, f.sort));
}

/**
 * Counts per facet value, keyed "facet:value" (for example "status:triaged",
 * "typology:structuring", "recommendation:none", "risk:high", "assignee:unassigned",
 * "assignee:me"). Pass the result as QueueFilters' `counts`.
 */
export function countFacets(rows: readonly FilterableRow[], ctx: Partial<FilterContext> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  const bump = (k: string) => (out[k] = (out[k] ?? 0) + 1);
  for (const r of rows) {
    bump(`status:${r.status}`);
    bump(`typology:${r.typology}`);
    bump(`recommendation:${r.recommendation ?? "none"}`);
    const band = riskBand(r.riskScore);
    if (band) bump(`risk:${band}`);
    if (!r.assigneeId) bump("assignee:unassigned");
    else {
      bump(`assignee:${r.assigneeId}`);
      if (ctx.currentUserId && r.assigneeId === ctx.currentUserId) bump("assignee:me");
    }
  }
  return out;
}

/** Number of filters that differ from the defaults (search and sort not counted). */
export function activeFilterCount(f: QueueFilterState): number {
  return f.status.length + f.typology.length + f.recommendation.length + f.assignee.length + (f.risk !== "all" ? 1 : 0) + (f.dueWithinDays != null ? 1 : 0);
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

export function filtersEqual(a: QueueFilterState, b: QueueFilterState): boolean {
  return (
    a.q.trim() === b.q.trim() &&
    sameList(a.status, b.status) &&
    sameList(a.typology, b.typology) &&
    sameList(a.recommendation, b.recommendation) &&
    sameList(a.assignee, b.assignee) &&
    a.risk === b.risk &&
    a.sort === b.sort &&
    a.dueWithinDays === b.dueWithinDays
  );
}

/* ---------------- URL query strings ---------------- */

const URL_KEYS = { q: "q", status: "status", typology: "type", recommendation: "rec", assignee: "assignee", risk: "risk", sort: "sort", dueWithinDays: "due" } as const;

/**
 * Query string for the filters, without the leading "?". Defaults are left
 * out, so the default view serialises to "". Lists are comma-separated.
 */
export function serializeFilters(f: QueueFilterState): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set(URL_KEYS.q, f.q.trim());
  if (f.status.length) p.set(URL_KEYS.status, f.status.join(","));
  if (f.typology.length) p.set(URL_KEYS.typology, f.typology.join(","));
  if (f.recommendation.length) p.set(URL_KEYS.recommendation, f.recommendation.join(","));
  if (f.assignee.length) p.set(URL_KEYS.assignee, f.assignee.join(","));
  if (f.risk !== "all") p.set(URL_KEYS.risk, f.risk);
  if (f.sort !== DEFAULT_FILTERS.sort) p.set(URL_KEYS.sort, f.sort);
  if (f.dueWithinDays != null) p.set(URL_KEYS.dueWithinDays, String(f.dueWithinDays));
  return p.toString();
}

type ParamSource = string | URLSearchParams | Record<string, string | string[] | undefined>;

function getParam(src: URLSearchParams | Record<string, string | string[] | undefined>, key: string): string | undefined {
  if (src instanceof URLSearchParams) return src.getAll(key).join(",") || undefined;
  const v = src[key];
  return Array.isArray(v) ? v.join(",") : v;
}

function listOf(raw: string | undefined, allowed?: readonly string[], max = 20): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (!v || v.length > 80 || out.includes(v)) continue;
    if (allowed && !allowed.includes(v)) continue;
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Reads filters from a query string ("?q=acme&risk=high"), URLSearchParams,
 * or a Next.js searchParams object. Unknown values are dropped, so a stale or
 * hand-edited link never breaks the queue.
 */
export function parseFilters(input: ParamSource): QueueFilterState {
  const src = typeof input === "string" ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input) : input;
  const risk = getParam(src, URL_KEYS.risk);
  const sort = getParam(src, URL_KEYS.sort);
  const due = Number(getParam(src, URL_KEYS.dueWithinDays));
  return {
    q: (getParam(src, URL_KEYS.q) ?? "").trim().slice(0, 120),
    status: listOf(getParam(src, URL_KEYS.status), STATUS_VALUES),
    typology: listOf(getParam(src, URL_KEYS.typology), TYPOLOGY_VALUES),
    recommendation: listOf(getParam(src, URL_KEYS.recommendation), RECOMMENDATION_VALUES),
    assignee: listOf(getParam(src, URL_KEYS.assignee)),
    risk: (RISK_VALUES as readonly string[]).includes(risk ?? "") ? (risk as RiskBand) : "all",
    sort: (SORT_VALUES as readonly string[]).includes(sort ?? "") ? (sort as QueueSort) : DEFAULT_FILTERS.sort,
    dueWithinDays: Number.isInteger(due) && due >= 0 && due <= 365 && getParam(src, URL_KEYS.dueWithinDays) ? due : null,
  };
}

/* ---------------- saved views ---------------- */

export interface SavedView {
  id: string;
  name: string;
  filters: QueueFilterState;
  builtIn?: boolean;
}

export const BUILT_IN_VIEWS: readonly SavedView[] = [
  { id: "builtin-high-unassigned", name: "High risk, unassigned", builtIn: true, filters: { ...DEFAULT_FILTERS, risk: "high", assignee: ["unassigned"], sort: "risk" } },
  { id: "builtin-batch-close", name: "Ready for batch close", builtIn: true, filters: { ...DEFAULT_FILTERS, recommendation: ["close"], status: ["triaged"], sort: "confidence" } },
  { id: "builtin-due-5d", name: "Due within 5 days", builtIn: true, filters: { ...DEFAULT_FILTERS, dueWithinDays: 5, sort: "sla" } },
];

/** Normalises anything read back from storage into a valid filter state. */
export function coerceFilters(raw: unknown): QueueFilterState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FILTERS };
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []).join(",");
  return parseFilters({
    q: typeof r.q === "string" ? r.q : "",
    status: list(r.status),
    type: list(r.typology),
    rec: list(r.recommendation),
    assignee: list(r.assignee),
    risk: typeof r.risk === "string" ? r.risk : undefined,
    sort: typeof r.sort === "string" ? r.sort : undefined,
    due: typeof r.dueWithinDays === "number" ? String(r.dueWithinDays) : undefined,
  });
}

/** Reads user views stored as JSON. Anything malformed is skipped. */
export function parseSavedViews(json: string | null): SavedView[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return [];
    const out: SavedView[] = [];
    for (const v of data) {
      if (!v || typeof v !== "object") continue;
      const { id, name, filters } = v as Record<string, unknown>;
      if (typeof id !== "string" || typeof name !== "string" || !name.trim()) continue;
      out.push({ id, name: name.trim().slice(0, 60), filters: coerceFilters(filters) });
    }
    return out.slice(0, 50);
  } catch {
    return [];
  }
}

/** Adds a view, replacing one with the same name (case-insensitive). Newest first. */
export function upsertView(views: readonly SavedView[], name: string, filters: QueueFilterState, id: string): SavedView[] {
  const clean = name.trim().slice(0, 60);
  if (!clean) return [...views];
  const rest = views.filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
  return [{ id, name: clean, filters: { ...filters } }, ...rest].slice(0, 50);
}

export function removeView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((v) => v.id !== id);
}
