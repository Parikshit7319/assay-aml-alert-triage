import Papa from "papaparse";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scenarioToBundle } from "@/lib/demo/bundle";
import { csvToScenarios, payloadToScenario } from "@/lib/demo/csv-browser";
import { createLiveFeed } from "@/lib/demo/live-feed";
import { clearDemoState, DEMO_STATE_VERSION, loadDemoState, MAX_STATE_BYTES, saveDemoState } from "@/lib/demo/persist";
import { WATCHLIST } from "@/lib/demo/scenarios";
import { buildShadowSet, confusionMatrix, type ShadowRow } from "@/lib/demo/shadow";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { CSV_COLUMNS, parseAlertCsv } from "@/lib/import-schema";
import { newId } from "@/lib/util";

const NOW = new Date("2026-10-03T15:00:00Z");
const watchlist = WATCHLIST.map((w) => ({ ...w, id: newId("WL") }));
const triage = (s: Parameters<typeof scenarioToBundle>[0]) => runTriage(scenarioToBundle(s, watchlist, newId("ALT")), DEFAULT_POLICY, new SimulatedProvider());

/** Same two alerts as src/app/app/import/template/route.ts. */
function templateCsv(now = NOW.getTime()) {
  const iso = (daysAgo: number, h = 12) => new Date(now - daysAgo * 86_400_000 + (h - 12) * 3_600_000).toISOString();
  const rows: Record<string, string>[] = [];
  const s = {
    alert_id: "TM-100231",
    rule_code: "CASH-STRUCT-01",
    rule_description: "Three or more cash deposits between $8,000 and $10,000 within 30 days",
    typology: "structuring",
    alert_created_at: iso(0),
    customer_id: "CUST-55102",
    customer_name: "Sample Customer A",
    customer_type: "individual",
    occupation: "Food truck owner",
    country: "US",
    onboarded_at: iso(500),
    risk_rating: "medium",
    expected_monthly_volume: "6000",
    kyc_notes: "",
  };
  const deposits = [
    [9, 9200, "Main St location"],
    [7, 9650, "Oak Ave location"],
    [7, 9400, "Main St location"],
    [4, 9800, "Harbor location"],
  ] as const;
  deposits.forEach(([d, amt, loc], i) => rows.push({ ...s, txn_id: `TX-A${i + 1}`, txn_timestamp: iso(d, 10 + i), amount: String(amt), direction: "in", channel: "cash", counterparty_name: "", counterparty_country: "", location: loc, memo: "", triggered: "Y" }));
  for (let i = 0; i < 8; i++) rows.push({ ...s, txn_id: `TX-A${10 + i}`, txn_timestamp: iso(5 + i * 9, 9), amount: String(1400 + i * 35), direction: "in", channel: "ach", counterparty_name: "Square settlement", counterparty_country: "US", location: "", memo: "", triggered: "N" });
  const p = {
    alert_id: "TM-100232",
    rule_code: "ACH-VOL-02",
    rule_description: "Outbound ACH count above three times the 90-day baseline",
    typology: "payroll_pattern",
    alert_created_at: iso(0, 9),
    customer_id: "CUST-55219",
    customer_name: "Sample Business B LLC",
    customer_type: "business",
    occupation: "Dental practice",
    country: "US",
    onboarded_at: iso(900),
    risk_rating: "low",
    expected_monthly_volume: "48000",
    kyc_notes: "",
  };
  const staff = ["Employee 1", "Employee 2", "Employee 3", "Employee 4"];
  for (let d = 70; d > 0; d -= 14) staff.forEach((e, i) => rows.push({ ...p, txn_id: `TX-B${d}-${i}`, txn_timestamp: iso(d, 6), amount: String(2100 + i * 400), direction: "out", channel: "ach", counterparty_name: e, counterparty_country: "US", location: "", memo: "PAYROLL", triggered: d <= 14 ? "Y" : "N" }));
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows.map((r) => CSV_COLUMNS.map((c) => r[c] ?? "")) });
}

describe("parseAlertCsv", () => {
  it("groups the template into two valid payloads", () => {
    const { payloads, errors } = parseAlertCsv(templateCsv());
    expect(errors).toEqual([]);
    expect(payloads.map((p) => p.alert.external_id)).toEqual(["TM-100231", "TM-100232"]);
    const [a, b] = payloads;
    expect(a.transactions).toHaveLength(12);
    expect(a.alert.triggered_transaction_ids).toEqual(["TX-A1", "TX-A2", "TX-A3", "TX-A4"]);
    expect(a.customer).toMatchObject({ type: "individual", expected_monthly_volume: 6000, country: "US" });
    expect(a.customer.kyc_notes).toBeUndefined();
    expect(b.customer.type).toBe("business");
    expect(b.transactions).toHaveLength(20);
    expect(b.alert.triggered_transaction_ids).toHaveLength(4);
  });

  it("normalises headers, case and money formatting", () => {
    const csv = [
      " Alert_ID ,RULE_CODE,customer_id,customer_name,customer_type,txn_id,txn_timestamp,amount,direction,channel,triggered",
      'A1,WIRE-GEO-02,C1,Jane Roe,Individual,T1,2026-09-01T10:00:00Z,"$12,500.50",OUT,Wire,yes',
    ].join("\n");
    const { payloads, errors } = parseAlertCsv(csv);
    expect(errors).toEqual([]);
    expect(payloads[0].transactions[0]).toMatchObject({ amount: 12500.5, direction: "out", channel: "wire" });
    expect(payloads[0].customer.type).toBe("individual");
    expect(payloads[0].alert.triggered_transaction_ids).toEqual(["T1"]);
  });

  it("rejects files missing required columns", () => {
    const { payloads, errors } = parseAlertCsv("alert_id,rule_code\nA1,X");
    expect(payloads).toEqual([]);
    expect(errors[0]).toMatch(/^Missing required columns: customer_id, customer_name, txn_id, txn_timestamp, amount, direction, channel\./);
  });

  it("skips an invalid alert and keeps the rest", () => {
    const csv = templateCsv().replace(/(TX-A2,[^,]+,9650,)in,/, "$1sideways,");
    const { payloads, errors } = parseAlertCsv(csv);
    expect(payloads.map((p) => p.alert.external_id)).toEqual(["TM-100232"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Alert TM-100231: transactions\.1\.direction /);
  });

  it("caps a file at 200 alerts", () => {
    const head = "alert_id,rule_code,customer_id,customer_name,txn_id,txn_timestamp,amount,direction,channel";
    const body = Array.from({ length: 201 }, (_, i) => `A${i},R,C${i},N,T${i},2026-09-01T00:00:00Z,10,in,cash`);
    const { payloads, errors } = parseAlertCsv([head, ...body].join("\n"));
    expect(payloads).toEqual([]);
    expect(errors[0]).toMatch(/up to 200 alerts/);
  });
});

describe("payloadToScenario", () => {
  it("assigns fresh ids and maps triggered external ids to them", () => {
    const { payloads } = parseAlertCsv(templateCsv());
    const s = payloadToScenario(payloads[0], NOW);
    expect(s.customer.id).toMatch(/^KYC-/);
    expect(s.transactions.every((t) => /^TXN-/.test(t.id))).toBe(true);
    expect(new Set(s.transactions.map((t) => t.id)).size).toBe(12);
    const triggered = s.transactions.filter((t) => s.alert.triggeredTxnIds.includes(t.id));
    expect(triggered.map((t) => t.amountCents)).toEqual([920_000, 965_000, 940_000, 980_000]);
    expect(triggered.map((t) => t.branch)).toEqual(["Main St location", "Oak Ave location", "Main St location", "Harbor location"]);
    expect(s.customer.expectedMonthlyVolumeCents).toBe(600_000);
    expect(s.customer.onboardedAt).toBeInstanceOf(Date);
    expect(s.alert.typology).toBe("structuring");
  });

  it("defaults createdAt to now, infers typology and drops unknown trigger ids", () => {
    const s = payloadToScenario(
      {
        alert: { external_id: "X1", rule_code: "P2P-FUNNEL-03", triggered_transaction_ids: ["E1", "nope"] },
        customer: { external_id: "C1", name: "Jo", type: "individual" },
        transactions: [{ external_id: "E1", timestamp: "2026-10-01T12:00:00Z", amount: 10.005, direction: "in", channel: "p2p" }],
        prior_cases: [{ kind: "sar", opened_at: "2025-01-01T00:00:00Z", outcome: "SAR filed", summary: "x" }],
      },
      NOW,
    );
    expect(s.alert.createdAt).toEqual(NOW);
    expect(s.alert.typology).toBe("funnel_account");
    expect(s.alert.ruleDescription).toBe("P2P-FUNNEL-03");
    expect(s.alert.triggeredTxnIds).toEqual([s.transactions[0].id]);
    expect(s.customer).toMatchObject({ country: "US", riskRating: "medium", occupation: null, onboardedAt: null, expectedMonthlyVolumeCents: null });
    expect(s.priorCases[0]).toMatchObject({ kind: "sar", openedAt: new Date("2025-01-01T00:00:00Z") });
    expect(s.priorCases[0].id).toMatch(/^CASE-/);
  });

  it("produces scenarios the engine can triage", async () => {
    const { scenarios, errors } = csvToScenarios(templateCsv(), NOW);
    expect(errors).toEqual([]);
    for (const s of scenarios) {
      const r = await triage(s);
      expect(r.outcome).not.toBe("error");
    }
  });
});

describe("live feed", () => {
  it("yields valid, distinct scenarios created at now that triage cleanly", async () => {
    const feed = createLiveFeed(42);
    const keys = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const now = new Date(NOW.getTime() + i * 60_000);
      const s = feed.next(now);
      keys.add(s.key);
      expect(s.alert.createdAt).toEqual(now);
      const ids = new Set(s.transactions.map((t) => t.id));
      expect(s.alert.triggeredTxnIds.every((id) => ids.has(id))).toBe(true);
      expect(s.transactions.every((t) => t.ts.getTime() <= now.getTime())).toBe(true);
      const r = await triage(s);
      expect(r.outcome).not.toBe("error");
      expect(["close", "escalate", "human_review"]).toContain(r.recommendation);
    }
    expect(keys.size).toBe(60);
  });

  it("follows the weighted mix and keeps customer names readable", () => {
    const feed = createLiveFeed(7, { avoidNames: ["Maya Okafor"] });
    const counts: Record<string, number> = {};
    const names: string[] = [];
    for (let i = 0; i < 500; i++) {
      const s = feed.next(NOW);
      counts[s.alert.typology] = (counts[s.alert.typology] ?? 0) + 1;
      names.push(s.customer.name);
    }
    expect(counts.payroll_pattern / 500).toBeGreaterThan(0.22);
    expect(counts.payroll_pattern / 500).toBeLessThan(0.38);
    expect(counts.seasonal_cash / 500).toBeGreaterThan(0.13);
    expect(counts.sanctions_name / 500).toBeLessThan(0.1);
    expect(names.some((n) => /^Customer \d+$/.test(n))).toBe(false);
  });

  it("is deterministic per seed", () => {
    const a = createLiveFeed(99);
    const b = createLiveFeed(99);
    const c = createLiveFeed(100);
    const run = (f: ReturnType<typeof createLiveFeed>) => Array.from({ length: 10 }, () => f.next(NOW).customer.name);
    const ra = run(a);
    expect(run(b)).toEqual(ra);
    expect(run(c)).not.toEqual(ra);
  });
});

describe("persist", () => {
  let store: Record<string, string>;
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const install = (impl: Partial<Storage>) => Object.defineProperty(globalThis, "localStorage", { value: impl, configurable: true, writable: true });

  beforeEach(() => {
    store = {};
    install({
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("round-trips nested Dates and leaves other strings alone", () => {
    const state = {
      alerts: [
        {
          id: "ALT-1",
          createdAt: new Date("2026-10-01T10:00:00.000Z"),
          slaDueAt: new Date("2026-10-31T10:00:00.000Z"),
          sarDueAt: null,
          runs: [{ startedAt: new Date("2026-10-01T10:02:00.000Z") }],
          s: { customer: { onboardedAt: new Date("2025-01-01T00:00:00.000Z") }, transactions: [{ ts: new Date("2026-09-30T08:00:00.000Z") }], priorCases: [{ openedAt: new Date("2025-06-01T00:00:00.000Z") }] },
        },
      ],
      audit: [{ ts: new Date("2026-10-01T10:05:00.000Z"), detail: "2026-10-01T10:05:00.000Z", hash: "abc" }],
      note: "2026-10-01T10:05:00Z",
      day: "2026-10-01",
    };
    expect(saveDemoState("k", state)).toBe(true);
    const back = loadDemoState<typeof state>("k")!;
    const a = back.alerts[0];
    for (const d of [a.createdAt, a.slaDueAt, a.runs[0].startedAt, a.s.customer.onboardedAt, a.s.transactions[0].ts, a.s.priorCases[0].openedAt, back.audit[0].ts]) expect(d).toBeInstanceOf(Date);
    expect(a.createdAt.getTime()).toBe(state.alerts[0].createdAt.getTime());
    expect(a.s.transactions[0].ts.toISOString()).toBe("2026-09-30T08:00:00.000Z");
    expect(a.sarDueAt).toBeNull();
    expect(back.audit[0].detail).toBe("2026-10-01T10:05:00.000Z");
    expect(back.note).toBe("2026-10-01T10:05:00Z");
    expect(back.day).toBe("2026-10-01");
  });

  it("ignores saves from another schema version and clears", () => {
    expect(saveDemoState("k", { a: 1 }, DEMO_STATE_VERSION + 1)).toBe(true);
    expect(loadDemoState("k")).toBeNull();
    expect(saveDemoState("k", { a: 1 })).toBe(true);
    expect(loadDemoState<{ a: number }>("k")).toEqual({ a: 1 });
    clearDemoState("k");
    expect(store.k).toBeUndefined();
    expect(loadDemoState("k")).toBeNull();
  });

  it("refuses payloads over the size guard", () => {
    expect(saveDemoState("big", { blob: "x".repeat(MAX_STATE_BYTES) })).toBe(false);
    expect(store.big).toBeUndefined();
  });

  it("never throws when storage is broken or missing", () => {
    install({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(saveDemoState("k", { a: 1 })).toBe(false);
    expect(loadDemoState("k")).toBeNull();
    expect(() => clearDemoState("k")).not.toThrow();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(saveDemoState("k", { a: 1 })).toBe(false);
    expect(loadDemoState("k")).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    store.k = "{not json";
    expect(loadDemoState("k")).toBeNull();
  });
});

describe("shadow mode", () => {
  const row = (agent: ShadowRow["agent"], human: ShadowRow["human"], typology: ShadowRow["typology"] = "payroll_pattern"): ShadowRow => ({
    id: newId("ALT"),
    typology,
    customerName: "x",
    agent,
    model: agent === "human_review" ? "close" : agent,
    human,
    confidence: 0.9,
    createdAt: NOW,
  });

  it("computes counts and rates", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => row("close", "close")),
      ...Array.from({ length: 2 }, () => row("close", "escalate")),
      ...Array.from({ length: 3 }, () => row("escalate", "escalate", "structuring")),
      row("escalate", "close", "structuring"),
      row("human_review", "close", "other"),
      row("human_review", "escalate", "other"),
    ];
    const m = confusionMatrix(rows);
    expect(m).toMatchObject({
      total: 16,
      agentClose_humanClose: 8,
      agentClose_humanEscalate: 2,
      agentEscalate_humanClose: 1,
      agentEscalate_humanEscalate: 3,
      review_humanClose: 1,
      review_humanEscalate: 1,
    });
    expect(m.agreementRate).toBeCloseTo(11 / 14);
    expect(m.missedEscalationRate).toBeCloseTo(2 / 10);
    expect(m.overEscalationRate).toBeCloseTo(1 / 4);
    expect(m.reviewRate).toBeCloseTo(2 / 16);

    const s = confusionMatrix(rows, "structuring");
    expect(s.total).toBe(4);
    expect(s.agreementRate).toBeCloseTo(3 / 4);
    expect(s.missedEscalationRate).toBeNull();

    const empty = confusionMatrix([], "seasonal_cash");
    expect(empty.total).toBe(0);
    expect(empty.agreementRate).toBeNull();
  });

  it("builds a deterministic shadow history over the last 60 days", async () => {
    const a = await buildShadowSet(11, NOW, 60);
    const b = await buildShadowSet(11, NOW, 60);
    expect(a).toHaveLength(60);
    const sig = (rows: ShadowRow[]) => rows.map((r) => [r.customerName, r.typology, r.agent, r.model, r.human, r.createdAt.getTime()]);
    expect(sig(b)).toEqual(sig(a));
    for (const r of a) {
      expect(NOW.getTime() - r.createdAt.getTime()).toBeLessThanOrEqual(60 * 86_400_000);
      expect(r.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(["close", "escalate"]).toContain(r.human);
    }
    for (let i = 1; i < a.length; i++) expect(a[i].createdAt.getTime()).toBeGreaterThanOrEqual(a[i - 1].createdAt.getTime());
    const m = confusionMatrix(a);
    expect(m.total).toBe(60);
    expect(m.agreementRate).toBeGreaterThan(0.75);
  });
});
