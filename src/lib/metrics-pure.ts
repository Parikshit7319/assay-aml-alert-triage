import type { Typology } from "./db/schema";

/** Modeled guardrail: how often two human reviewers disagree on a close. Replace with your own QA baseline. */
export const HUMAN_DISAGREEMENT_BASELINE = 0.03;
export const L3_MIN_QA = 2000;
export const L3_MIN_AGREEMENT = 0.98;

export interface RollupLike {
  weekStart: string;
  typology: Typology;
  mode: "manual" | "shadow" | "assisted";
  alerts: number;
  closes: number;
  escalations: number;
  sarsFiled: number;
  l1Seconds: number;
  l2Seconds: number;
  recsAccepted: number;
  recsOverridden: number;
  qaSampled: number;
  qaAgreed: number;
  missedEscalations: number;
  synthetic: boolean;
}

export interface WeekRow {
  weekStart: string;
  mode: "manual" | "shadow" | "assisted";
  alerts: number;
  closes: number;
  escalations: number;
  sars: number;
  l1Hours: number;
  l2Hours: number;
  hoursPerSar: number | null;
  qaSampled: number;
  qaAgreed: number;
  missed: number;
  accepted: number;
  overridden: number;
  synthetic: boolean;
}

export interface TypologyStat {
  typology: Typology;
  alerts: number;
  escalationRate: number;
  shadowAgreement: number | null;
  qaSampled: number;
  qaAgreement: number | null;
  missedRate: number | null;
}

export function aggregateWeeks(input: RollupLike[]): WeekRow[] {
  const rows = [...input].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const byWeek = new Map<string, WeekRow>();
  for (const r of rows) {
    const w =
      byWeek.get(r.weekStart) ??
      ({ weekStart: r.weekStart, mode: r.mode, alerts: 0, closes: 0, escalations: 0, sars: 0, l1Hours: 0, l2Hours: 0, hoursPerSar: null, qaSampled: 0, qaAgreed: 0, missed: 0, accepted: 0, overridden: 0, synthetic: r.synthetic } as WeekRow);
    w.alerts += r.alerts;
    w.closes += r.closes;
    w.escalations += r.escalations;
    w.sars += r.sarsFiled;
    w.l1Hours += r.l1Seconds / 3600;
    w.l2Hours += r.l2Seconds / 3600;
    w.qaSampled += r.qaSampled;
    w.qaAgreed += r.qaAgreed;
    w.missed += r.missedEscalations;
    w.accepted += r.recsAccepted;
    w.overridden += r.recsOverridden;
    byWeek.set(r.weekStart, w);
  }
  return [...byWeek.values()].map((w) => ({ ...w, hoursPerSar: w.sars ? (w.l1Hours + w.l2Hours) / w.sars : null }));
}

export function aggregateTypologies(rows: RollupLike[]): TypologyStat[] {
  const acc = new Map<Typology, { alerts: number; esc: number; sa: number; so: number; qs: number; qa: number; missed: number }>();
  for (const r of rows) {
    const a = acc.get(r.typology) ?? { alerts: 0, esc: 0, sa: 0, so: 0, qs: 0, qa: 0, missed: 0 };
    a.alerts += r.alerts;
    a.esc += r.escalations;
    if (r.mode === "shadow") {
      a.sa += r.recsAccepted;
      a.so += r.recsOverridden;
    }
    a.qs += r.qaSampled;
    a.qa += r.qaAgreed;
    a.missed += r.missedEscalations;
    acc.set(r.typology, a);
  }
  return [...acc.entries()].map(([typology, a]) => ({
    typology,
    alerts: a.alerts,
    escalationRate: a.alerts ? a.esc / a.alerts : 0,
    shadowAgreement: a.sa + a.so ? a.sa / (a.sa + a.so) : null,
    qaSampled: a.qs,
    qaAgreement: a.qs ? a.qa / a.qs : null,
    missedRate: a.qs ? a.missed / a.qs : null,
  }));
}

