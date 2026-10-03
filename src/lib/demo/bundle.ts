import { DEFAULT_HIGH_RISK_COUNTRIES } from "@/lib/engine/policy";
import type { EvidenceBundle, WatchlistRecord } from "@/lib/engine/types";
import { DAY } from "@/lib/util";
import type { Scenario } from "./scenarios";

/** Same windows as loadBundle(): 90-day lookback plus three years of older history. */
export function scenarioToBundle(s: Scenario, watchlist: WatchlistRecord[], alertId: string): EvidenceBundle {
  const asOf = s.alert.createdAt.getTime();
  const sorted = [...s.transactions].filter((t) => t.ts.getTime() <= asOf).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  return {
    alert: { id: alertId, ...s.alert },
    customer: s.customer,
    transactions: sorted.filter((t) => asOf - t.ts.getTime() <= 90 * DAY),
    history: sorted.filter((t) => asOf - t.ts.getTime() > 90 * DAY && asOf - t.ts.getTime() <= 3 * 365 * DAY),
    priorCases: s.priorCases.filter((c) => c.openedAt.getTime() < asOf),
    watchlist,
    highRiskCountries: DEFAULT_HIGH_RISK_COUNTRIES,
  };
}
