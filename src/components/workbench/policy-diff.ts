/**
 * Policy editor metadata and the change summary against the default policy.
 * Pure: shared by the editor UI and its tests.
 */
import type { AutonomyLevel, PolicySettings, Typology } from "@/lib/db/schema";
import { AUTONOMY_LEVELS, DEFAULT_POLICY } from "@/lib/engine/policy";
import { TYPOLOGY_LABEL } from "@/lib/labels";

export type NumericPolicyKey = "closeConfidenceFloor" | "autoCloseConfidenceFloor" | "watchlistForceL2Similarity" | "minTransactionsForDecision" | "qaSampleRate";

export interface PolicyField {
  key: NumericPolicyKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** What the setting does, in one or two sentences. */
  what: string;
  /** What moving it does to the queue. */
  effect: string;
  format: (v: number) => string;
}

const two = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const POLICY_FIELDS: readonly PolicyField[] = [
  {
    key: "closeConfidenceFloor",
    label: "Close confidence floor",
    min: 0.5,
    max: 0.99,
    step: 0.01,
    what: "A close recommendation below this confidence is sent to human review instead.",
    effect: "Raise it and fewer alerts show as Close, more as Needs review. Lower it and more closes become eligible for batch approval.",
    format: two,
  },
  {
    key: "autoCloseConfidenceFloor",
    label: "Auto-close confidence floor (L3 only)",
    min: 0.8,
    max: 0.99,
    step: 0.01,
    what: "Alert types at L3 close without a click only at or above this confidence. It has no effect below L3.",
    effect: "Raise it and fewer L3 alerts auto-close; the rest wait for a batch or an analyst.",
    format: two,
  },
  {
    key: "watchlistForceL2Similarity",
    label: "Watchlist similarity that forces L2",
    min: 0.7,
    max: 0.99,
    step: 0.01,
    what: "A name at or above this similarity to a watchlist entry goes to L2, whatever the model concludes. The agent never clears a match.",
    effect: "Lower it and more name matches escalate, including more false matches. Raise it and weaker matches reach L1 with the candidate shown.",
    format: two,
  },
  {
    key: "minTransactionsForDecision",
    label: "Minimum transactions to decide",
    min: 1,
    max: 30,
    step: 1,
    what: "With fewer transactions than this in the 90-day window, the agent abstains and an analyst decides from scratch.",
    effect: "Raise it and more thin-file alerts arrive without a recommendation.",
    format: (v) => `${Math.round(v)} transactions`,
  },
  {
    key: "qaSampleRate",
    label: "QA sample rate",
    min: 0.01,
    max: 0.5,
    step: 0.01,
    what: "Share of every batch-approved close drawn for QA review, at least one alert per batch.",
    effect: "Raise it and QA has more to review, and an alert type reaches the 2,000-review L3 bar sooner.",
    format: pct,
  },
];

export function levelName(level: AutonomyLevel): string {
  return `L${level} ${AUTONOMY_LEVELS[level].name}`;
}

export interface PolicyChange {
  key: string;
  label: string;
  from: string;
  to: string;
}

const OTHER_LABELS: Record<string, { label: string; format: (v: unknown) => string }> = {
  internalSlaDays: { label: "Internal review SLA", format: (v) => `${v} days` },
  rationaleDepth: { label: "Rationale kept for closes", format: (v) => String(v) },
};

/**
 * Settings in `next` that differ from `base` (the default policy unless given),
 * with readable labels and before and after values. Version and model provider are ignored.
 */
export function diffPolicy(next: PolicySettings, base: PolicySettings = DEFAULT_POLICY): PolicyChange[] {
  const out: PolicyChange[] = [];
  for (const t of Object.keys(TYPOLOGY_LABEL) as Typology[]) {
    const a = base.autonomy[t];
    const b = next.autonomy[t];
    if (a !== b && b != null) out.push({ key: `autonomy.${t}`, label: `${TYPOLOGY_LABEL[t]} autonomy`, from: levelName(a), to: levelName(b) });
  }
  for (const f of POLICY_FIELDS) {
    const a = base[f.key];
    const b = next[f.key];
    if (Math.abs(a - b) > 1e-9) out.push({ key: f.key, label: f.label, from: f.format(a), to: f.format(b) });
  }
  for (const [key, meta] of Object.entries(OTHER_LABELS)) {
    const a = base[key as keyof PolicySettings];
    const b = next[key as keyof PolicySettings];
    if (a !== b) out.push({ key, label: meta.label, from: meta.format(a), to: meta.format(b) });
  }
  return out;
}

/** Problems that make a policy inconsistent. Empty when the policy is usable. */
export function policyWarnings(p: PolicySettings): string[] {
  const w: string[] = [];
  if (p.autoCloseConfidenceFloor < p.closeConfidenceFloor) {
    w.push(`The auto-close floor (${two(p.autoCloseConfidenceFloor)}) is below the close floor (${two(p.closeConfidenceFloor)}). Auto-close still needs the close floor, so the effective auto-close floor is ${two(p.closeConfidenceFloor)}.`);
  }
  const l3 = (Object.keys(p.autonomy) as Typology[]).filter((t) => p.autonomy[t] === 3);
  if (l3.length) {
    w.push(`${l3.map((t) => TYPOLOGY_LABEL[t]).join(", ")} ${l3.length === 1 ? "is" : "are"} set to L3 auto-close. Confirm each has met the QA bar and has written sign-off.`);
  }
  return w;
}

/** Clamps and rounds a slider value to the field's range and step. */
export function clampField(f: Pick<PolicyField, "min" | "max" | "step">, v: number): number {
  if (!Number.isFinite(v)) return f.min;
  const stepped = Math.round((v - f.min) / f.step) * f.step + f.min;
  const decimals = (String(f.step).split(".")[1] ?? "").length;
  return Number(Math.min(f.max, Math.max(f.min, stepped)).toFixed(decimals));
}
