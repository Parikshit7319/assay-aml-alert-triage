/**
 * Guided tour content and geometry. Pure: no React, no DOM, so placement can
 * be unit tested with plain numbers.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** CSS selector for the element to spotlight, for example [data-tour="queue"]. */
  target: string;
  title: string;
  body: string;
  placement?: TourPlacement;
}

export const DEMO_TOUR_STORAGE_KEY = "assay-demo-tour-v1";

/** Five steps for the in-browser demo. Mount the matching data-tour attributes on the workbench. */
export const DEMO_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="queue"]',
    title: "The queue, riskiest first",
    body: "The agent has already triaged every open alert here. The queue is sorted by its risk score, so the alerts most likely to need L2 sit at the top instead of in arrival order. Every customer in this demo is invented.",
    placement: "bottom",
  },
  {
    target: '[data-tour="recommendation"]',
    title: "A recommendation you can check",
    body: "Close, escalate or needs review, with a confidence and a risk score. Each claim in the rationale carries a stamp naming the record it came from. If a citation points to a record the agent was not given, the alert goes to human review.",
    placement: "bottom",
  },
  {
    target: '[data-tour="evidence"]',
    title: "Click a stamp, see the record",
    body: "Click any citation stamp and the records behind it light up in highlighter yellow in this table. You check the agent's reading against the raw transactions instead of taking it on trust.",
    placement: "top",
  },
  {
    target: '[data-tour="decide"]',
    title: "You make the call",
    body: "Accept the recommendation or override it. Disagreeing with the agent takes a reason code, and every override is logged and counted in the override rate. The agent never files a SAR and never clears a watchlist match.",
    placement: "left",
  },
  {
    target: '[data-tour="audit"]',
    title: "Every action, hash-chained",
    body: "Each triage run and each decision lands in an append-only log with the model and policy version. Every entry stores the SHA-256 hash of the entry before it, so editing or deleting any event breaks the chain from that point on.",
    placement: "right",
  },
];

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PopoverPosition {
  top: number;
  left: number;
  /** Where the popover ended up relative to the target, or "center" with no target. */
  placement: TourPlacement | "center";
}

const OPPOSITE: Record<TourPlacement, TourPlacement> = { top: "bottom", bottom: "top", left: "right", right: "left" };

function fits(p: TourPlacement, t: Rect, pop: Size, vp: Size, gap: number, margin: number): boolean {
  if (p === "top") return t.top - gap - pop.height >= margin;
  if (p === "bottom") return t.top + t.height + gap + pop.height <= vp.height - margin;
  if (p === "left") return t.left - gap - pop.width >= margin;
  return t.left + t.width + gap + pop.width <= vp.width - margin;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Where to put the popover. Tries the preferred side, then the opposite side,
 * then the remaining sides; if none fits it goes below or above, whichever has
 * more room, clamped to the viewport. No target (or a target scrolled fully
 * out of view) centers the popover.
 */
export function placePopover(target: Rect | null, pop: Size, vp: Size, preferred: TourPlacement = "bottom", gap = 12, margin = 12): PopoverPosition {
  const visible = target && target.width > 0 && target.height > 0 && target.top < vp.height && target.top + target.height > 0 && target.left < vp.width && target.left + target.width > 0;
  if (!target || !visible) {
    return { top: Math.max(margin, (vp.height - pop.height) / 2), left: Math.max(margin, (vp.width - pop.width) / 2), placement: "center" };
  }
  const order: TourPlacement[] = [preferred, OPPOSITE[preferred], ...(["bottom", "top", "right", "left"] as TourPlacement[]).filter((p) => p !== preferred && p !== OPPOSITE[preferred])];
  let side = order.find((p) => fits(p, target, pop, vp, gap, margin));
  if (!side) side = target.top > vp.height - (target.top + target.height) ? "top" : "bottom";

  let top: number;
  let left: number;
  if (side === "top" || side === "bottom") {
    top = side === "top" ? target.top - gap - pop.height : target.top + target.height + gap;
    left = target.left + target.width / 2 - pop.width / 2;
  } else {
    left = side === "left" ? target.left - gap - pop.width : target.left + target.width + gap;
    top = target.top + target.height / 2 - pop.height / 2;
  }
  return {
    top: clamp(top, margin, vp.height - margin - pop.height),
    left: clamp(left, margin, vp.width - margin - pop.width),
    placement: side,
  };
}

/** The spotlight hole: the target rect padded and clipped to the viewport. Null when nothing is visible. */
export function spotlightRect(target: Rect | null, vp: Size, pad = 6): Rect | null {
  if (!target) return null;
  const top = Math.max(0, target.top - pad);
  const left = Math.max(0, target.left - pad);
  const bottom = Math.min(vp.height, target.top + target.height + pad);
  const right = Math.min(vp.width, target.left + target.width + pad);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** CSS clip-path for a full-viewport dim layer with a rectangular hole (even-odd fill), in px. */
export function cutoutClipPath(hole: Rect | null, vp: Size): string {
  const outer = `0px 0px, ${vp.width}px 0px, ${vp.width}px ${vp.height}px, 0px ${vp.height}px, 0px 0px`;
  if (!hole) return `polygon(${outer})`;
  const { top: t, left: l, width: w, height: h } = hole;
  const inner = `${l}px ${t}px, ${l + w}px ${t}px, ${l + w}px ${t + h}px, ${l}px ${t + h}px, ${l}px ${t}px`;
  return `polygon(evenodd, ${outer}, ${inner})`;
}

/* ---------------- first-visit storage ---------------- */

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function store(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** True when this browser has finished or skipped the tour. False when storage is unavailable. */
export function hasSeenTour(key: string, s: StorageLike | null = store()): boolean {
  try {
    return !!s?.getItem(key);
  } catch {
    return false;
  }
}

export function markTourSeen(key: string, completed: boolean, s: StorageLike | null = store()): void {
  try {
    s?.setItem(key, JSON.stringify({ at: new Date().toISOString(), completed }));
  } catch {
    // Storage blocked: the tour may show again next visit, which is harmless.
  }
}

export function resetTour(key: string, s: StorageLike | null = store()): void {
  try {
    s?.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
