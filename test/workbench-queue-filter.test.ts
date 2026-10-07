import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyQueueFilters,
  BUILT_IN_VIEWS,
  coerceFilters,
  countFacets,
  DEFAULT_FILTERS,
  filtersEqual,
  parseFilters,
  parseSavedViews,
  removeView,
  riskBand,
  serializeFilters,
  upsertView,
  type FilterableRow,
  type QueueFilterState,
} from "@/components/workbench/queue-filter";

const now = new Date("2026-10-07T12:00:00Z");
const day = 86_400_000;
const at = (daysFromNow: number) => new Date(now.getTime() + daysFromNow * day).toISOString();

const rows: FilterableRow[] = [
  { id: "ALT-AAA111", customerName: "Maya Okafor", ruleCode: "CASH-STRUCT-01", typology: "structuring", status: "triaged", recommendation: "escalate", riskScore: 88, confidence: 0.91, assigneeId: null, createdAt: at(-10), slaDueAt: at(20) },
  { id: "ALT-BBB222", customerName: "Heights Dental LLC", ruleCode: "ACH-VOL-02", typology: "payroll_pattern", status: "triaged", recommendation: "close", riskScore: 12, confidence: 0.97, assigneeId: "u1", createdAt: at(-2), slaDueAt: at(28) },
  { id: "ALT-CCC333", customerName: "Tomas Novak", ruleCode: "WIRE-GEO-01", typology: "high_risk_wire", status: "locked", recommendation: "human_review", riskScore: 70, confidence: null, assigneeId: "u2", createdAt: at(-27), slaDueAt: at(3) },
  { id: "ALT-DDD444", customerName: "Grace Chen", ruleCode: "CASH-VOL-03", typology: "seasonal_cash", status: "new", recommendation: null, riskScore: null, confidence: null, assigneeId: null, createdAt: at(-31), slaDueAt: at(-1) },
  { id: "ALT-EEE555", customerName: "Okafor Imports", ruleCode: "P2P-FUNNEL", typology: "funnel_account", status: "triaged", recommendation: "close", riskScore: 40, confidence: 0.88, assigneeId: "u1", createdAt: at(-5), slaDueAt: at(25) },
];
const ids = (xs: FilterableRow[]) => xs.map((r) => r.id);
const f = (p: Partial<QueueFilterState>): QueueFilterState => ({ ...DEFAULT_FILTERS, ...p });

describe("riskBand", () => {
  it("uses 70 and 40 as the band edges", () => {
    expect(riskBand(70)).toBe("high");
    expect(riskBand(69)).toBe("medium");
    expect(riskBand(40)).toBe("medium");
    expect(riskBand(39)).toBe("low");
    expect(riskBand(null)).toBeNull();
  });
});

describe("applyQueueFilters", () => {
  it("defaults to every row, riskiest first, nulls last, without mutating input", () => {
    const copy = [...rows];
    expect(ids(applyQueueFilters(rows, DEFAULT_FILTERS, { now }))).toEqual(["ALT-AAA111", "ALT-CCC333", "ALT-EEE555", "ALT-BBB222", "ALT-DDD444"]);
    expect(rows).toEqual(copy);
  });

  it("searches customer name, alert id and rule code, case-insensitively", () => {
    expect(ids(applyQueueFilters(rows, f({ q: "okafor" }), { now }))).toEqual(["ALT-AAA111", "ALT-EEE555"]);
    expect(ids(applyQueueFilters(rows, f({ q: "bbb222" }), { now }))).toEqual(["ALT-BBB222"]);
    expect(ids(applyQueueFilters(rows, f({ q: "  wire-geo " }), { now }))).toEqual(["ALT-CCC333"]);
  });

  it("combines facets with AND across facets and OR within one", () => {
    expect(ids(applyQueueFilters(rows, f({ status: ["triaged", "locked"], recommendation: ["close"] }), { now }))).toEqual(["ALT-EEE555", "ALT-BBB222"]);
    expect(ids(applyQueueFilters(rows, f({ recommendation: ["none"] }), { now }))).toEqual(["ALT-DDD444"]);
    expect(ids(applyQueueFilters(rows, f({ typology: ["structuring", "high_risk_wire"] }), { now }))).toEqual(["ALT-AAA111", "ALT-CCC333"]);
  });

  it("resolves me and unassigned against the context", () => {
    expect(ids(applyQueueFilters(rows, f({ assignee: ["me"] }), { now, currentUserId: "u1" }))).toEqual(["ALT-EEE555", "ALT-BBB222"]);
    expect(ids(applyQueueFilters(rows, f({ assignee: ["me"] }), { now }))).toEqual([]);
    expect(ids(applyQueueFilters(rows, f({ assignee: ["unassigned", "u2"] }), { now }))).toEqual(["ALT-AAA111", "ALT-CCC333", "ALT-DDD444"]);
  });

  it("filters by risk band, excluding unscored rows", () => {
    expect(ids(applyQueueFilters(rows, f({ risk: "high" }), { now }))).toEqual(["ALT-AAA111", "ALT-CCC333"]);
    expect(ids(applyQueueFilters(rows, f({ risk: "medium" }), { now }))).toEqual(["ALT-EEE555"]);
    expect(ids(applyQueueFilters(rows, f({ risk: "low" }), { now }))).toEqual(["ALT-BBB222"]);
  });

  it("keeps alerts due within N days, overdue included", () => {
    expect(ids(applyQueueFilters(rows, f({ dueWithinDays: 5, sort: "sla" }), { now }))).toEqual(["ALT-DDD444", "ALT-CCC333"]);
    expect(ids(applyQueueFilters(rows, f({ dueWithinDays: 0 }), { now }))).toEqual(["ALT-DDD444"]);
  });

  it("sorts by age, SLA and confidence", () => {
    expect(ids(applyQueueFilters(rows, f({ sort: "age" }), { now }))[0]).toBe("ALT-DDD444");
    expect(ids(applyQueueFilters(rows, f({ sort: "sla" }), { now }))).toEqual(["ALT-DDD444", "ALT-CCC333", "ALT-AAA111", "ALT-EEE555", "ALT-BBB222"]);
    expect(ids(applyQueueFilters(rows, f({ sort: "confidence" }), { now }))).toEqual(["ALT-BBB222", "ALT-AAA111", "ALT-EEE555", "ALT-CCC333", "ALT-DDD444"]);
  });

  it("built-in views select what their names promise", () => {
    const [highUnassigned, batch, due] = BUILT_IN_VIEWS;
    expect(ids(applyQueueFilters(rows, highUnassigned.filters, { now }))).toEqual(["ALT-AAA111"]);
    expect(ids(applyQueueFilters(rows, batch.filters, { now }))).toEqual(["ALT-BBB222", "ALT-EEE555"]);
    expect(ids(applyQueueFilters(rows, due.filters, { now }))).toEqual(["ALT-DDD444", "ALT-CCC333"]);
  });
});

describe("countFacets", () => {
  it("counts each facet value", () => {
    const c = countFacets(rows, { currentUserId: "u1" });
    expect(c["status:triaged"]).toBe(3);
    expect(c["recommendation:none"]).toBe(1);
    expect(c["risk:high"]).toBe(2);
    expect(c["assignee:unassigned"]).toBe(2);
    expect(c["assignee:me"]).toBe(2);
    expect(c["typology:payroll_pattern"]).toBe(1);
  });
});

describe("URL round trip", () => {
  it("serialises the default view to an empty string", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters("")).toEqual(DEFAULT_FILTERS);
  });

  it("round-trips every field", () => {
    const s: QueueFilterState = { q: "acme & co", status: ["triaged", "locked"], typology: ["structuring"], recommendation: ["close", "none"], assignee: ["me", "u-9"], risk: "high", sort: "sla", dueWithinDays: 5 };
    const qs = serializeFilters(s);
    expect(qs).toContain("risk=high");
    expect(parseFilters(qs)).toEqual(s);
    expect(parseFilters(`?${qs}`)).toEqual(s);
    expect(parseFilters(new URLSearchParams(qs))).toEqual(s);
  });

  it("drops unknown or hostile values", () => {
    const p = parseFilters("status=triaged,bogus&type=nope&rec=close&risk=extreme&sort=random&due=-3");
    expect(p.status).toEqual(["triaged"]);
    expect(p.typology).toEqual([]);
    expect(p.recommendation).toEqual(["close"]);
    expect(p.risk).toBe("all");
    expect(p.sort).toBe("risk");
    expect(p.dueWithinDays).toBeNull();
  });

  it("reads a Next.js searchParams object", () => {
    expect(parseFilters({ risk: "low", status: ["new", "triaged"], q: undefined })).toEqual({ ...DEFAULT_FILTERS, risk: "low", status: ["new", "triaged"] });
  });
});

describe("equality, counts and saved views", () => {
  it("compares lists without caring about order", () => {
    expect(filtersEqual(f({ status: ["a", "b"] }), f({ status: ["b", "a"] }))).toBe(true);
    expect(filtersEqual(f({ risk: "high" }), f({}))).toBe(false);
    expect(activeFilterCount(f({ status: ["new"], risk: "low", dueWithinDays: 5, q: "x" }))).toBe(3);
  });

  it("upserts by name, newest first, and removes by id", () => {
    let views = upsertView([], "Mine", f({ assignee: ["me"] }), "v1");
    views = upsertView(views, "Wires", f({ typology: ["high_risk_wire"] }), "v2");
    views = upsertView(views, "mine", f({ assignee: ["me"], risk: "high" }), "v3");
    expect(views.map((v) => v.id)).toEqual(["v3", "v2"]);
    expect(removeView(views, "v2").map((v) => v.id)).toEqual(["v3"]);
    expect(upsertView(views, "   ", f({}), "v4")).toHaveLength(2);
  });

  it("parses stored views defensively", () => {
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews("not json")).toEqual([]);
    expect(parseSavedViews('{"a":1}')).toEqual([]);
    const stored = JSON.stringify([{ id: "v1", name: "Mine", filters: { assignee: ["me"], risk: "high", sort: "bogus", status: [1, "new"] } }, { id: 2, name: "bad" }, { id: "v3", name: "" }]);
    const parsed = parseSavedViews(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].filters).toEqual({ ...DEFAULT_FILTERS, assignee: ["me"], risk: "high", status: ["new"] });
    expect(coerceFilters(undefined)).toEqual(DEFAULT_FILTERS);
  });
});
