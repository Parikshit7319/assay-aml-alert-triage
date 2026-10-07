import { describe, expect, it } from "vitest";
import { inflowVsExpected, monthlyFlows } from "@/components/workbench/customer-inflow";
import { buildTemplateCsv, checkImportFile, countByTypology, toErrorRows } from "@/components/workbench/import-template";
import { clampField, diffPolicy, POLICY_FIELDS, policyWarnings } from "@/components/workbench/policy-diff";
import { dismissToast, makeToast, pushToast } from "@/components/workbench/toast-queue";
import { cutoutClipPath, DEMO_TOUR_STEPS, hasSeenTour, markTourSeen, placePopover, resetTour, spotlightRect } from "@/components/workbench/tour";
import { median, summarizeWorkload, type WorkloadRow } from "@/components/workbench/workload";
import { csvToScenarios } from "@/lib/demo/csv-browser";
import { CSV_COLUMNS } from "@/lib/import-schema";
import { DEFAULT_POLICY } from "@/lib/engine/policy";

describe("toasts", () => {
  it("picks durations by tone and action", () => {
    expect(makeToast(1, { title: "a" }).durationMs).toBe(5000);
    expect(makeToast(1, { title: "a", tone: "error" }).durationMs).toBe(10000);
    expect(makeToast(1, { title: "a", action: { label: "Undo", onClick() {} } }).durationMs).toBe(8000);
    expect(makeToast(1, { title: "a", durationMs: 0 }).durationMs).toBe(Infinity);
    expect(makeToast(1, { title: "a" }).tone).toBe("info");
  });

  it("keeps three, dropping the oldest non-error first", () => {
    let list = [makeToast(1, { title: "e1", tone: "error" }), makeToast(2, { title: "i2" }), makeToast(3, { title: "o3", tone: "ok" })];
    list = pushToast(list, makeToast(4, { title: "w4", tone: "warn" }));
    expect(list.map((t) => t.id)).toEqual([1, 3, 4]);
    list = pushToast(list, makeToast(5, { title: "e5", tone: "error" }));
    expect(list.map((t) => t.id)).toEqual([1, 4, 5]);
    expect(dismissToast(list, 4).map((t) => t.id)).toEqual([1, 5]);
  });

  it("drops the oldest error only when every toast is an error", () => {
    const errs = [1, 2, 3].map((id) => makeToast(id, { title: `e${id}`, tone: "error" }));
    expect(pushToast(errs, makeToast(4, { title: "e4", tone: "error" })).map((t) => t.id)).toEqual([2, 3, 4]);
  });
});

describe("workload", () => {
  const row = (userId: string, open: number): WorkloadRow => ({ userId, name: userId, role: "L1 analyst", open, l2: 0, decidedLast7d: 0, oldestOpenDays: null });
  it("computes medians", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("flags more than 1.5x the median, with a floor of 3 open", () => {
    const s = summarizeWorkload([row("a", 4), row("b", 6), row("c", 7), row("d", 14)], 1.5, 5);
    expect(s.median).toBe(6.5);
    expect([...s.overloaded]).toEqual(["d"]);
    expect(s.max).toBe(14);
    expect(s.totalOpen).toBe(36);
    expect([...summarizeWorkload([row("a", 0), row("b", 2), row("c", 0)]).overloaded]).toEqual([]);
    expect([...summarizeWorkload([row("a", 0), row("b", 12), row("c", 0)]).overloaded]).toEqual(["b"]);
    expect([...summarizeWorkload([row("solo", 40)]).overloaded]).toEqual([]);
  });
});

describe("policy diff", () => {
  it("is empty for the default policy", () => {
    expect(diffPolicy(DEFAULT_POLICY)).toEqual([]);
    expect(policyWarnings(DEFAULT_POLICY)).toEqual([]);
  });

  it("lists autonomy and threshold changes with readable values", () => {
    const next = { ...DEFAULT_POLICY, version: 4, provider: "anthropic" as const, closeConfidenceFloor: 0.9, qaSampleRate: 0.2, autonomy: { ...DEFAULT_POLICY.autonomy, structuring: 3 as const } };
    expect(diffPolicy(next)).toEqual([
      { key: "autonomy.structuring", label: "Structuring autonomy", from: "L1 Recommend", to: "L3 Auto-close" },
      { key: "closeConfidenceFloor", label: "Close confidence floor", from: "0.85", to: "0.90" },
      { key: "qaSampleRate", label: "QA sample rate", from: "10%", to: "20%" },
    ]);
    expect(policyWarnings(next).join(" ")).toContain("Structuring is set to L3");
  });

  it("warns when the auto-close floor sits under the close floor", () => {
    expect(policyWarnings({ ...DEFAULT_POLICY, autoCloseConfidenceFloor: 0.8 })[0]).toContain("effective auto-close floor is 0.85");
  });

  it("clamps and steps slider values", () => {
    const close = POLICY_FIELDS.find((f) => f.key === "closeConfidenceFloor")!;
    expect(clampField(close, 0.8549)).toBe(0.85);
    expect(clampField(close, 2)).toBe(0.99);
    expect(clampField(close, Number.NaN)).toBe(0.5);
    const min = POLICY_FIELDS.find((f) => f.key === "minTransactionsForDecision")!;
    expect(clampField(min, 7.6)).toBe(8);
  });
});

describe("import template and errors", () => {
  it("builds a template the browser importer accepts", () => {
    const csv = buildTemplateCsv(new Date("2026-10-07T12:00:00Z"));
    const header = csv.split(/\r?\n/)[0];
    expect(header.split(",")).toEqual([...CSV_COLUMNS]);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(4);
    const { scenarios, errors } = csvToScenarios(csv, new Date("2026-10-07T12:00:00Z"));
    expect(errors).toEqual([]);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].transactions).toHaveLength(3);
    expect(scenarios[0].alert.triggeredTxnIds).toHaveLength(3);
    expect(countByTypology(scenarios)).toEqual([{ typology: "structuring", alerts: 1, transactions: 3 }]);
  });

  it("splits parser messages into where and what", () => {
    expect(toErrorRows(["Row 4: Too few fields.", "Alert TM-9: customer.name Required.", "Missing required columns: amount."])).toEqual([
      { where: "Row 4", problem: "Too few fields." },
      { where: "Alert TM-9", problem: "customer.name Required." },
      { where: "File", problem: "Missing required columns: amount." },
    ]);
  });

  it("checks type and size before reading", () => {
    expect(checkImportFile({ name: "alerts.csv", size: 1200 })).toBeNull();
    expect(checkImportFile({ name: "alerts.xlsx", size: 1200 })).toContain("not a CSV");
    expect(checkImportFile({ name: "alerts.csv", size: 0 })).toContain("empty");
    expect(checkImportFile({ name: "big.csv", size: 3 * 1024 * 1024 })).toContain("2 MB");
  });
});

describe("customer inflow", () => {
  const asOf = new Date("2026-10-07T12:00:00Z");
  const t = (iso: string, dollars: number, direction: "in" | "out" = "in") => ({ ts: iso, amountCents: dollars * 100, direction });
  const txns = [t("2026-08-03T10:00:00Z", 3000), t("2026-09-10T10:00:00Z", 9000), t("2026-09-11T10:00:00Z", 2000, "out"), t("2026-10-02T10:00:00Z", 6000), t("2026-06-01T10:00:00Z", 99999), t("2026-10-08T10:00:00Z", 5000)];

  it("buckets calendar months up to asOf, keeping empty ones", () => {
    const m = monthlyFlows(txns, asOf, 3);
    expect(m.map((x) => [x.label, x.inCents / 100, x.outCents / 100])).toEqual([
      ["Aug 2026", 3000, 0],
      ["Sep 2026", 9000, 2000],
      ["Oct 2026", 6000, 0],
    ]);
  });

  it("compares trailing inflow with expected volume", () => {
    const r = inflowVsExpected(txns, 300_000, asOf, 90);
    expect(r.actualMonthlyInCents).toBe(600_000);
    expect(r.ratio).toBe(2);
    expect(r.sentence).toBe("$6,000 a month in, 2x the $3,000 expected at onboarding.");
    expect(inflowVsExpected(txns, null, asOf).sentence).toContain("No expected volume on file");
    expect(inflowVsExpected(txns, 600_000, asOf).sentence).toContain("in line with");
  });
});

describe("tour geometry", () => {
  const vp = { width: 1200, height: 800 };
  const pop = { width: 340, height: 200 };

  it("has the five demo steps with their targets", () => {
    expect(DEMO_TOUR_STEPS.map((s) => s.target)).toEqual(['[data-tour="queue"]', '[data-tour="recommendation"]', '[data-tour="evidence"]', '[data-tour="decide"]', '[data-tour="audit"]']);
    for (const s of DEMO_TOUR_STEPS) expect(`${s.title} ${s.body}`).not.toMatch(/[\u2013\u2014]/);
  });

  it("places on the preferred side when it fits", () => {
    const p = placePopover({ top: 100, left: 400, width: 200, height: 50 }, pop, vp, "bottom");
    expect(p).toEqual({ top: 162, left: 330, placement: "bottom" });
  });

  it("flips to the opposite side, then clamps into the viewport", () => {
    const p = placePopover({ top: 700, left: 1100, width: 80, height: 40 }, pop, vp, "bottom");
    expect(p.placement).toBe("top");
    expect(p.top).toBe(700 - 12 - 200);
    expect(p.left).toBe(1200 - 12 - 340);
  });

  it("centers with no target or an off-screen target", () => {
    expect(placePopover(null, pop, vp)).toEqual({ top: 300, left: 430, placement: "center" });
    expect(placePopover({ top: -500, left: 0, width: 100, height: 100 }, pop, vp).placement).toBe("center");
  });

  it("pads and clips the spotlight, and cuts a hole in the dim layer", () => {
    expect(spotlightRect({ top: 2, left: 10, width: 100, height: 50 }, vp, 6)).toEqual({ top: 0, left: 4, width: 112, height: 58 });
    expect(spotlightRect(null, vp)).toBeNull();
    expect(cutoutClipPath(null, vp)).toBe("polygon(0px 0px, 1200px 0px, 1200px 800px, 0px 800px, 0px 0px)");
    expect(cutoutClipPath({ top: 10, left: 20, width: 30, height: 40 }, vp)).toContain("evenodd");
  });

  it("remembers a finished tour in storage and survives a broken one", () => {
    const mem = new Map<string, string>();
    const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(hasSeenTour("k", s)).toBe(false);
    markTourSeen("k", true, s);
    expect(hasSeenTour("k", s)).toBe(true);
    resetTour("k", s);
    expect(hasSeenTour("k", s)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(hasSeenTour("k", broken)).toBe(false);
    expect(() => markTourSeen("k", false, broken)).not.toThrow();
  });
});
