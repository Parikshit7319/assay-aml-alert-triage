/** The home page H1, also drawn on the Open Graph image. */
export const HEADLINE = "Clear the false positives without losing the paper trail.";

/**
 * Modeled numbers shared by the home and pricing pages. Same assumptions as
 * /day-in-the-queue and the assumptions table on /sources: $90,000 loaded cost,
 * 1,560 productive hours a year, 30 minutes per L1 review today, and the
 * twelve-alert shift mix. Change them there and here together.
 */
export const LOADED_COST = 90_000;
export const PRODUCTIVE_HOURS = 1_560;
export const HOURLY_RATE = LOADED_COST / PRODUCTIVE_HOURS; // $57.69
export const L1_MINUTES = 30;

/** The modeled shift on /day-in-the-queue: alerts per group, minutes today, minutes with Assay. */
export const SHIFT_GROUPS = [
  { n: 7, today: 30, after: 8 }, // clean recommendation the analyst agrees with
  { n: 4, today: 30, after: 30 }, // abstain, lock or policy review: no saving
  { n: 1, today: 30, after: 24 }, // escalation with a draft narrative
] as const;

export const SHIFT_ALERTS = SHIFT_GROUPS.reduce((s, g) => s + g.n, 0); // 12
export const SHIFT_TODAY_MIN = SHIFT_GROUPS.reduce((s, g) => s + g.n * g.today, 0); // 360
export const SHIFT_AFTER_MIN = SHIFT_GROUPS.reduce((s, g) => s + g.n * g.after, 0); // 200
export const SHIFT_SAVED_MIN = SHIFT_TODAY_MIN - SHIFT_AFTER_MIN; // 160
export const TIME_SAVED_SHARE = SHIFT_SAVED_MIN / SHIFT_TODAY_MIN; // 0.444

const perAlert = (minutes: number) => (minutes / 60) * HOURLY_RATE;
/** Modeled L1 labor per alert today: 30 minutes at $57.69, about $28.85. */
export const LABOR_PER_ALERT = perAlert(L1_MINUTES);
/** Modeled L1 labor per alert at the shift mix with Assay, about $16.03. */
export const LABOR_PER_ALERT_AFTER = perAlert(SHIFT_AFTER_MIN / SHIFT_ALERTS);

export const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Pricing calculator rule: above this many runs a month, or more than the Team seat count, pricing is Enterprise by contract. */
export const ENTERPRISE_RUNS = 20_000;
