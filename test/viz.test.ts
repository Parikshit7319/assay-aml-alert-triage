import { describe, expect, it } from "vitest";
import {
  aggregateCounterparties,
  amountAxis,
  formatCompactUsd,
  hasNearCtrCash,
  inWindow,
  monthTicks,
  niceCeil,
  partyLabel,
  radialLayout,
  sqrtScale,
  truncate,
  windowBefore,
  type VizTxnWithCountry,
} from "@/components/viz/helpers";

const txn = (p: Partial<VizTxnWithCountry> & { id: string }): VizTxnWithCountry => ({
  ts: "2026-09-15T15:00:00Z",
  amountCents: 100_00,
  direction: "in",
  channel: "ach",
  counterpartyName: null,
  branch: null,
  counterpartyCountry: null,
  ...p,
});

describe("viz scales", () => {
  it("rounds up to nice numbers and builds three clean ticks", () => {
    expect(niceCeil(9_900)).toBe(10_000);
    expect(niceCeil(11_500)).toBe(12_000);
    expect(niceCeil(260)).toBe(300);
    const a = amountAxis(990_000);
    expect(a.domain).toBe(1_000_000);
    expect(a.ticks.map(formatCompactUsd)).toEqual(["$1k", "$4k", "$10k"]);
    const withCtr = amountAxis(990_000, { includeCtr: true });
    expect(withCtr.domain).toBeGreaterThan(1_000_000);
    expect(formatCompactUsd(250_000)).toBe("$2.5k");
    expect(formatCompactUsd(25_000)).toBe("$250");
  });

  it("maps a square-root scale and clamps out-of-range values", () => {
    const s = sqrtScale(10_000, 100);
    expect(s(0)).toBe(0);
    expect(s(2_500)).toBeCloseTo(50);
    expect(s(10_000)).toBe(100);
    expect(s(40_000)).toBe(100);
  });

  it("windows to the 90 days before the alert and ticks each month start", () => {
    const w = windowBefore("2026-10-03T15:00:00Z", 90);
    const rows = inWindow(
      [
        txn({ id: "late", ts: "2026-10-04T00:00:00Z" }),
        txn({ id: "b", ts: "2026-09-01T00:00:00Z" }),
        txn({ id: "a", ts: "2026-07-10T00:00:00Z" }),
        txn({ id: "old", ts: "2026-06-01T00:00:00Z" }),
      ],
      w,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(monthTicks(w).map((t) => t.label)).toEqual(["Aug", "Sep", "Oct"]);
  });

  it("only asks for the CTR guide when cash inflows sit between $8,000 and $10,000", () => {
    expect(hasNearCtrCash([txn({ id: "1", channel: "cash", amountCents: 940_000 })])).toBe(true);
    expect(hasNearCtrCash([txn({ id: "2", channel: "wire", amountCents: 940_000 })])).toBe(false);
    expect(hasNearCtrCash([txn({ id: "3", channel: "cash", direction: "out", amountCents: 940_000 })])).toBe(false);
    expect(hasNearCtrCash([txn({ id: "4", channel: "cash", amountCents: 500_000 })])).toBe(false);
  });
});

describe("counterparty aggregation", () => {
  it("groups by counterparty, labels cash by location, and flags high-risk countries", () => {
    const nodes = aggregateCounterparties(
      [
        txn({ id: "c1", channel: "cash", branch: "Westheimer", amountCents: 950_000 }),
        txn({ id: "c2", channel: "cash", branch: "Westheimer", amountCents: 960_000 }),
        txn({ id: "w1", channel: "wire", direction: "out", counterpartyName: "Gulf Trade FZE", counterpartyCountry: "ae", amountCents: 1_800_000 }),
        txn({ id: "w2", channel: "wire", direction: "in", counterpartyName: "Gulf Trade FZE", counterpartyCountry: "AE", amountCents: 200_000 }),
        txn({ id: "a1", counterpartyName: "Acme Payroll", amountCents: 300_000 }),
      ],
      { highRiskCountries: ["AE"], highlightedIds: ["a1"] },
    );
    expect(nodes.map((n) => n.label)).toEqual(["Gulf Trade FZE", "Cash at Westheimer", "Acme Payroll"]);
    const gulf = nodes[0];
    expect(gulf.highRisk).toBe(true);
    expect(gulf.country).toBe("AE");
    expect(gulf.inCents).toBe(200_000);
    expect(gulf.outCents).toBe(1_800_000);
    expect(gulf.count).toBe(2);
    expect(nodes[1].txnIds).toEqual(["c1", "c2"]);
    expect(nodes[2].highlighted).toBe(true);
    expect(partyLabel({ channel: "cash", counterpartyName: null, branch: null })).toBe("Cash, location unknown");
  });

  it("folds the tail into Other but never folds high-risk or highlighted counterparties", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      txn({ id: `t${i}`, counterpartyName: `Party ${String(i).padStart(2, "0")}`, amountCents: (100 - i) * 100_00 }),
    );
    many.push(txn({ id: "tiny-risk", counterpartyName: "Tiny Shell Co", counterpartyCountry: "IR", amountCents: 1_00 }));
    many.push(txn({ id: "tiny-lit", counterpartyName: "Tiny Lit Co", amountCents: 2_00 }));
    const nodes = aggregateCounterparties(many, { highRiskCountries: ["IR"], highlightedIds: ["tiny-lit"], maxNodes: 18 });
    expect(nodes).toHaveLength(18);
    const other = nodes[nodes.length - 1];
    expect(other.label).toBe("Other (10)");
    expect(other.folded).toBe(10);
    expect(nodes.some((n) => n.label === "Tiny Shell Co")).toBe(true);
    expect(nodes.some((n) => n.label === "Tiny Lit Co")).toBe(true);
    const ids = new Set(nodes.flatMap((n) => n.txnIds));
    expect(ids.size).toBe(many.length);
  });

  it("lays senders on the left arc and receivers on the right, deterministically", () => {
    const nodes = aggregateCounterparties([
      txn({ id: "1", counterpartyName: "Sender A", direction: "in", amountCents: 500_00 }),
      txn({ id: "2", counterpartyName: "Sender B", direction: "in", amountCents: 400_00 }),
      txn({ id: "3", counterpartyName: "Receiver", direction: "out", amountCents: 900_00 }),
    ]);
    const a = radialLayout(nodes, { x: 100, y: 100 }, { x: 50, y: 50 });
    const b = radialLayout(nodes, { x: 100, y: 100 }, { x: 50, y: 50 });
    expect(a).toEqual(b);
    for (const p of a) {
      if (p.node.inCents >= p.node.outCents) expect(p.x).toBeLessThan(100);
      else expect(p.x).toBeGreaterThan(100);
    }
    expect(truncate("Gulf Trade General Trading FZE", 18)).toHaveLength(18);
  });
});
