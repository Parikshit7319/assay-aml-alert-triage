/**
 * A stream of fresh synthetic alerts for the demo's "live feed". The mix is
 * weighted toward the false positives that dominate a real AML queue: payroll
 * and seasonal cash first, true structuring and funnel patterns far less often.
 */
import { hashString, prng, type Rng } from "@/lib/util";
import {
  Ctx,
  funnelScenario,
  injectionScenario,
  payrollScenario,
  sanctionsScenario,
  seasonalScenario,
  structuringVariant,
  thinScenario,
  volumeSpikeScenario,
  wireScenario,
  type Scenario,
} from "./scenarios";

type Builder = (c: Ctx, alertAt: Date) => Scenario;

function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r < 0) return v;
  }
  return options[options.length - 1][0];
}

/**
 * Share of each alert family in the feed. Weights sum to 1. Variants inside a
 * family lean toward the benign case, as they do in production queues.
 */
export const FEED_MIX: readonly { family: string; weight: number; build: Builder }[] = [
  { family: "payroll", weight: 0.3, build: (c, at) => payrollScenario(c, at, c.rng.int(0, 11), c.rng.chance(0.1)) },
  {
    family: "seasonal",
    weight: 0.2,
    build: (c, at) =>
      seasonalScenario(
        c,
        at,
        c.rng.int(0, 8),
        weighted(c.rng, [
          ["match", 0.75],
          ["big_spike", 0.15],
          ["no_history_spike", 0.1],
        ] as const),
      ),
  },
  {
    family: "structuring",
    weight: 0.15,
    build: (c, at) =>
      structuringVariant(
        c,
        at,
        weighted(c.rng, [
          ["consistent_business", 0.4],
          ["one_branch", 0.25],
          ["same_day", 0.2],
          ["note", 0.15],
        ] as const),
      ),
  },
  {
    family: "funnel",
    weight: 0.1,
    build: (c, at) =>
      funnelScenario(
        c,
        at,
        weighted(c.rng, [
          ["benign", 0.5],
          ["domestic_out", 0.3],
          ["high_risk", 0.2],
        ] as const),
      ),
  },
  { family: "high_risk_wire", weight: 0.1, build: (c, at) => wireScenario(c, at, c.rng.chance(0.6) ? "documented" : "first_time") },
  {
    family: "watchlist",
    weight: 0.05,
    build: (c, at) =>
      sanctionsScenario(
        c,
        at,
        weighted(c.rng, [
          ["different_country", 0.4],
          ["customer_name", 0.4],
          ["close_match", 0.2],
        ] as const),
      ),
  },
  { family: "thin", weight: 0.04, build: (c, at) => thinScenario(c, at) },
  { family: "volume", weight: 0.04, build: (c, at) => volumeSpikeScenario(c, at) },
  { family: "injection", weight: 0.02, build: (c, at) => injectionScenario(c, at, c.rng.chance(0.5) ? "memo" : "counterparty") },
];

/** Name pool is 900 combinations; recycle before the Ctx falls back to "Customer N". */
const NAME_RECYCLE_AT = 600;

/**
 * Builds one scenario from the weighted mix. Shared by the live feed and the
 * shadow-mode history so both draw from the same distribution.
 */
export function mixedScenario(c: Ctx, alertAt: Date, reserved: ReadonlySet<string> = new Set()): Scenario {
  if (c.usedNames.size > NAME_RECYCLE_AT) {
    c.usedNames.clear();
    reserved.forEach((n) => c.usedNames.add(n));
  }
  const pick = weighted(
    c.rng,
    FEED_MIX.map((m) => [m, m.weight] as const),
  );
  return pick.build(c, alertAt);
}

/** Seeds derived from the caller's seed, so passing the main demo seed still gives a different stream. */
export function derivedRng(seed: number, purpose: string): Rng {
  return prng(hashString(`${purpose}:${seed}`));
}

export interface LiveFeed {
  next(now: Date): Scenario;
}

/**
 * Returns a feed that yields a new random scenario on every call, with the
 * alert created at `now`. Pass the names already on screen in `avoidNames` to
 * keep new customers distinct from the starting queue.
 */
export function createLiveFeed(seed: number, opts: { avoidNames?: Iterable<string> } = {}): LiveFeed {
  const reserved = new Set(opts.avoidNames ?? []);
  const c = new Ctx(derivedRng(seed, "live-feed"), new Date());
  reserved.forEach((n) => c.usedNames.add(n));
  let n = 0;
  return {
    next(now: Date): Scenario {
      c.now = now;
      const s = mixedScenario(c, now, reserved);
      n += 1;
      return { ...s, key: `live_${n}_${s.key}` };
    },
  };
}
