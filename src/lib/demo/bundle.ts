import { DEFAULT_HIGH_RISK_COUNTRIES } from "@/lib/engine/policy";
import type { EvidenceBundle, WatchlistRecord } from "@/lib/engine/types";
import { DAY } from "@/lib/util";
import type { Scenario } from "./scenarios";

/** Same windows as loadBundle(): 90-day lookback plus three years of older history. */
export function scenarioToBundle(s: Scenario, watchlist: WatchlistRecord[], alertId: string): EvidenceBundle {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const asOf = s.alert.createdAt.getTime();
  let t = now();
  const alert = { id: alertId, ...s.alert };
  const alertMs = now() - t;
  t = now();
  const sorted = [...s.transactions].filter((x) => x.ts.getTime() <= asOf).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const transactions = sorted.filter((x) => asOf - x.ts.getTime() <= 90 * DAY);
  const history = sorted.filter((x) => asOf - x.ts.getTime() > 90 * DAY && asOf - x.ts.getTime() <= 3 * 365 * DAY);
  const txnMs = now() - t;
  t = now();
  const priorCases = s.priorCases.filter((c) => c.openedAt.getTime() < asOf);
  const casesMs = now() - t;
  return {
    alert,
    customer: s.customer,
    transactions,
    history,
    priorCases,
    watchlist,
    highRiskCountries: DEFAULT_HIGH_RISK_COUNTRIES,
    loadTimings: { alert: alertMs, transactions: txnMs, priorCases: casesMs },
  };
}
