import type { Typology } from "@/lib/db/schema";
import { DAY, type Rng } from "@/lib/util";

/**
 * Synthetic weekly history for the demo workspace, at the volume of a fintech
 * with ~15 L1 analysts (about 4,000 alerts a month). Weeks 1-4 are manual,
 * 5-6 shadow mode, 7-10 agent-assisted. Rates come from the modeled case:
 * 92% closed at L1, ~25% of escalations become SARs, 30 min per manual L1
 * review, 3 h per L2 investigation; assisted closes take 15 min, assisted
 * escalations 24 min, assisted L2 2.25 h.
 */
const MIX: { typology: Typology; share: number; escalation: number; shadowAgree: number; qaAgree: number }[] = [
  { typology: "payroll_pattern", share: 0.3, escalation: 0.01, shadowAgree: 0.99, qaAgree: 0.995 },
  { typology: "seasonal_cash", share: 0.2, escalation: 0.02, shadowAgree: 0.96, qaAgree: 0.975 },
  { typology: "structuring", share: 0.15, escalation: 0.16, shadowAgree: 0.88, qaAgree: 0.93 },
  { typology: "funnel_account", share: 0.1, escalation: 0.18, shadowAgree: 0.9, qaAgree: 0.94 },
  { typology: "high_risk_wire", share: 0.1, escalation: 0.12, shadowAgree: 0.85, qaAgree: 0.9 },
  { typology: "sanctions_name", share: 0.08, escalation: 0.06, shadowAgree: 0.92, qaAgree: 0.95 },
  { typology: "other", share: 0.07, escalation: 0.08, shadowAgree: 0.7, qaAgree: 0.8 },
];

export const WEEKLY_ALERTS = 923;
export const SAR_SHARE_OF_ESCALATIONS = 0.25;

export interface RollupRow {
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
  synthetic: true;
}

export function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  return new Date(x.getTime() - dow * DAY);
}

export function syntheticRollups(rng: Rng, now: Date, weeks = 10): RollupRow[] {
  const thisMonday = mondayOf(now);
  const rows: RollupRow[] = [];
  for (let w = weeks; w >= 1; w--) {
    const weekStart = new Date(thisMonday.getTime() - w * 7 * DAY).toISOString().slice(0, 10);
    const index = weeks - w + 1;
    const mode = index <= 4 ? "manual" : index <= 6 ? "shadow" : "assisted";
    const volume = Math.round(WEEKLY_ALERTS * (0.94 + rng.next() * 0.12));
    for (const m of MIX) {
      const alerts = Math.round(volume * m.share);
      const escalations = Math.round(alerts * m.escalation * (0.85 + rng.next() * 0.3));
      const closes = alerts - escalations;
      const sarsFiled = Math.round(escalations * SAR_SHARE_OF_ESCALATIONS * (0.8 + rng.next() * 0.4));
      const assisted = mode === "assisted";
      const l1Seconds = assisted ? closes * 900 + escalations * 1440 : alerts * 1800;
      const l2Seconds = Math.round(escalations * (assisted ? 8100 : 10800));
      let recsAccepted = 0;
      let recsOverridden = 0;
      let qaSampled = 0;
      let qaAgreed = 0;
      let missed = 0;
      if (mode !== "manual") {
        const agree = mode === "shadow" ? m.shadowAgree : m.qaAgree;
        recsAccepted = Math.round(alerts * agree);
        recsOverridden = alerts - recsAccepted;
      }
      if (assisted) {
        // Draw each QA outcome so small samples show real noise instead of rounding to 100%.
        qaSampled = Math.round(closes * 0.1);
        for (let q = 0; q < qaSampled; q++) {
          if (rng.next() < m.qaAgree) qaAgreed++;
          else if (rng.next() < 0.4) missed++; // share of disagreements that should have escalated
        }
      }
      rows.push({
        weekStart,
        typology: m.typology,
        mode,
        alerts,
        closes,
        escalations,
        sarsFiled,
        l1Seconds,
        l2Seconds,
        recsAccepted,
        recsOverridden,
        qaSampled,
        qaAgreed,
        missedEscalations: missed,
        synthetic: true,
      });
    }
  }
  return rows;
}
