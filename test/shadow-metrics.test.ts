import { describe, expect, it } from "vitest";
import type { AutonomyLevel, Typology } from "@/lib/db/schema";
import { humanDisposition, shadowReport, toShadowRows, type DecidedAlertLike } from "@/lib/shadow-metrics";

const at = "2026-10-01T12:00:00Z";
function item(alertId: string, typology: Typology, agent: DecidedAlertLike["agentRecommendation"], humanAction: DecidedAlertLike["humanAction"]): DecidedAlertLike {
  return { alertId, typology, agentRecommendation: agent, modelRecommendation: agent === "human_review" ? "close" : agent, confidence: 0.9, humanAction, decidedAt: at };
}

const autonomy: Record<Typology, AutonomyLevel> = {
  structuring: 0,
  funnel_account: 1,
  high_risk_wire: 1,
  sanctions_name: 1,
  payroll_pattern: 2,
  seasonal_cash: 2,
  other: 0,
};

describe("humanDisposition", () => {
  it("maps L1 and batch actions, and ignores agent and L2 actions", () => {
    expect(humanDisposition("accept_close")).toBe("close");
    expect(humanDisposition("override_to_close")).toBe("close");
    expect(humanDisposition("batch_close")).toBe("close");
    expect(humanDisposition("accept_escalate")).toBe("escalate");
    expect(humanDisposition("override_to_escalate")).toBe("escalate");
    expect(humanDisposition("auto_close")).toBeNull();
    expect(humanDisposition("sar_file")).toBeNull();
  });
});

describe("shadowReport", () => {
  const items: DecidedAlertLike[] = [
    item("A1", "structuring", "close", "accept_close"),
    item("A2", "structuring", "close", "override_to_escalate"), // missed escalation
    item("A3", "structuring", "escalate", "accept_escalate"),
    item("A4", "structuring", "escalate", "override_to_close"), // over-escalation
    item("A5", "structuring", "human_review", "accept_escalate"),
    item("A6", "payroll_pattern", "close", "batch_close"),
    item("A7", "payroll_pattern", "close", "auto_close"), // no human decision
    item("A8", "funnel_account", null, "accept_escalate"), // agent never ran
    item("A1", "structuring", "close", "override_to_escalate"), // duplicate alert: first decision wins
  ];

  it("counts each alert once and skips rows it cannot compare", () => {
    const rows = toShadowRows(items);
    expect(rows.map((r) => r.id)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(rows.find((r) => r.id === "A1")?.human).toBe("close");
  });

  it("builds the overall matrix and rates", () => {
    const r = shadowReport(items, autonomy);
    expect(r.overall).toMatchObject({
      total: 6,
      agentClose_humanClose: 2,
      agentClose_humanEscalate: 1,
      agentEscalate_humanClose: 1,
      agentEscalate_humanEscalate: 1,
      review_humanClose: 0,
      review_humanEscalate: 1,
    });
    expect(r.overall.agreementRate).toBeCloseTo(3 / 5);
    expect(r.overall.missedEscalationRate).toBeCloseTo(1 / 3);
    expect(r.overall.overEscalationRate).toBeCloseTo(1 / 2);
    expect(r.overall.reviewRate).toBeCloseTo(1 / 6);
    expect(r.skipped).toBe(2);
  });

  it("breaks down by typology and flags types in shadow", () => {
    const r = shadowReport(items, autonomy);
    expect(r.shadowTypologies.sort()).toEqual(["other", "structuring"]);
    const s = r.byTypology.find((x) => x.typology === "structuring")!;
    expect(s).toMatchObject({ level: 0, inShadow: true });
    expect(s.matrix.total).toBe(5);
    const p = r.byTypology.find((x) => x.typology === "payroll_pattern")!;
    expect(p).toMatchObject({ level: 2, inShadow: false });
    expect(p.matrix.agreementRate).toBe(1);
    // An L0 type with nothing decided still shows, with no rates.
    const o = r.byTypology.find((x) => x.typology === "other")!;
    expect(o.matrix.total).toBe(0);
    expect(o.matrix.agreementRate).toBeNull();
    // Largest first.
    expect(r.byTypology[0].typology).toBe("structuring");
  });

  it("is empty but well formed with no decisions", () => {
    const r = shadowReport([], { structuring: 1 });
    expect(r.overall.total).toBe(0);
    expect(r.overall.agreementRate).toBeNull();
    expect(r.byTypology).toEqual([]);
  });
});
