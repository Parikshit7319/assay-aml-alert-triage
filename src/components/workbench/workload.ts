/** Team workload math for the assignment view. Pure. */

export interface WorkloadRow {
  userId: string;
  name: string;
  role: string;
  open: number;
  l2: number;
  decidedLast7d: number;
  oldestOpenDays: number | null;
}

/** Flag anyone carrying more than this multiple of the team's median open load. */
export const OVERLOAD_FACTOR = 1.5;
/** Never flag fewer open alerts than this, so 2 against a median of 1 stays quiet. */
export const OVERLOAD_MIN_OPEN = 3;

export function median(values: readonly number[]): number {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export interface WorkloadSummary {
  median: number;
  /** Open count above which a person is flagged. */
  threshold: number;
  /** Largest open count, for scaling the inline bars. At least 1. */
  max: number;
  overloaded: Set<string>;
  totalOpen: number;
}

/**
 * Median open load and who is over `factor` times it. Someone is flagged when
 * their open count is above factor x median and at least OVERLOAD_MIN_OPEN.
 */
export function summarizeWorkload(rows: readonly WorkloadRow[], factor = OVERLOAD_FACTOR, unassigned = 0): WorkloadSummary {
  const m = median(rows.map((r) => r.open));
  const threshold = m * factor;
  const overloaded = new Set(rows.filter((r) => r.open > threshold && r.open >= OVERLOAD_MIN_OPEN && rows.length > 1).map((r) => r.userId));
  const max = Math.max(1, unassigned, ...rows.map((r) => r.open));
  return { median: m, threshold, max, overloaded, totalOpen: rows.reduce((s, r) => s + r.open, 0) + unassigned };
}
