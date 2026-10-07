"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap, useIsoLayoutEffect, useMounted, usePrefersReducedMotion, useStoredString } from "./overlay";
import { cutoutClipPath, hasSeenTour, markTourSeen, placePopover, spotlightRect, type Rect, type Size, type TourStep } from "./tour";
import "./workbench.css";

export { DEMO_TOUR_STEPS, DEMO_TOUR_STORAGE_KEY, resetTour, type TourStep } from "./tour";

export interface GuidedTourProps {
  steps: TourStep[];
  open: boolean;
  /** Called with true when the visitor reaches the end, false when they skip. */
  onClose: (completed: boolean) => void;
  /** localStorage key; when set, finishing or skipping marks the tour as seen for useTourAutostart. */
  storageKey?: string;
  /**
   * Called when a step becomes current (index 0 on open). Use it to bring the
   * step's target on screen, for example switching the demo to the alert view
   * before the "recommendation" step. Targets that render later are picked up.
   */
  onStepChange?: (index: number, step: TourStep) => void;
}

function findTarget(selector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

const toRect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });
const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

/**
 * Spotlight tour. Dims the page with a cutout around each step's target,
 * scrolls the target into view, and shows a popover with the step count and
 * Back, Next and Skip. Escape skips, Left and Right arrows move. A missing
 * target centers the popover. Repositions on resize and scroll.
 */
export function GuidedTour({ steps, open, onClose, storageKey, onStepChange }: GuidedTourProps) {
  const ids = useId();
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState<Size>({ width: 1024, height: 768 });
  const [pop, setPop] = useState<Size>({ width: 340, height: 220 });
  const [announcement, setAnnouncement] = useState("");
  const popRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const stepCb = useRef(onStepChange);
  useEffect(() => {
    stepCb.current = onStepChange;
  });

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setI(0);
      setAnnouncement("");
    }
  }

  const n = steps.length;
  const idx = Math.min(i, Math.max(0, n - 1));
  const step = steps[idx];
  const target = step?.target ?? "";
  const active = open && mounted && n > 0;

  const finish = useCallback(
    (completed: boolean) => {
      if (storageKey) markTourSeen(storageKey, completed);
      onClose(completed);
    },
    [onClose, storageKey],
  );

  useFocusTrap(popRef, active, { onEscape: () => finish(false), initialFocus: nextRef });

  // Tell the host which step is current, so it can show the right view.
  useEffect(() => {
    if (!active || !steps[idx]) return;
    scrolledFor.current = null;
    stepCb.current?.(idx, steps[idx]);
    // steps is read for the current index only; a new array with the same steps should not re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx]);

  // Measure target, viewport and popover on resize, scroll (any scroller), size changes and a slow
  // poll (a target can render after the host switches views). The first time the target is found
  // for a step, scroll it into view.
  useIsoLayoutEffect(() => {
    if (!active || !target) return;
    let raf = 0;
    let observed: HTMLElement | null = null;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : undefined;
    if (ro && popRef.current) ro.observe(popRef.current);
    const key = `${idx}:${target}`;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = findTarget(target);
        if (el && el !== observed) {
          if (observed) ro?.unobserve(observed);
          ro?.observe(el);
          observed = el;
        }
        if (el && scrolledFor.current !== key) {
          scrolledFor.current = key;
          const b = el.getBoundingClientRect();
          const fullyVisible = b.top >= 0 && b.bottom <= window.innerHeight && b.left >= 0 && b.right <= window.innerWidth;
          if (!fullyVisible) el.scrollIntoView({ block: b.height > window.innerHeight * 0.6 ? "start" : "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
        }
        const nextVp = { width: window.innerWidth, height: window.innerHeight };
        setVp((cur) => (cur.width === nextVp.width && cur.height === nextVp.height ? cur : nextVp));
        const r = el ? toRect(el.getBoundingClientRect()) : null;
        setRect((cur) => (sameRect(cur, r) ? cur : r));
        const p = popRef.current?.getBoundingClientRect();
        if (p) setPop((cur) => (Math.abs(cur.width - p.width) < 1 && Math.abs(cur.height - p.height) < 1 ? cur : { width: p.width, height: p.height }));
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const poll = window.setInterval(measure, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      ro?.disconnect();
    };
  }, [active, target, idx, reduced]);

  if (!active || !step) return null;

  const go = (to: number) => {
    const next = Math.max(0, Math.min(n - 1, to));
    if (next === idx) return;
    setI(next);
    setAnnouncement(`Step ${next + 1} of ${n}: ${steps[next].title}. ${steps[next].body}`);
    // Back is disabled on the first step; keep focus on a live control.
    if (next === 0) requestAnimationFrame(() => nextRef.current?.focus());
  };
  const isLast = idx === n - 1;
  const hole = spotlightRect(rect, vp);
  const pos = placePopover(hole, pop, vp, step.placement ?? "bottom");
  const missing = !rect;

  return createPortal(
    <div className="wb-tour">
      <div className="wb-tour__dim" style={{ clipPath: cutoutClipPath(hole, vp) }} aria-hidden="true" />
      {hole && <div className="wb-tour__ring" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} aria-hidden="true" />}
      <div
        ref={popRef}
        className="wb-tour__pop"
        data-placement={pos.placement}
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            if (isLast) finish(true);
            else go(idx + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(idx - 1);
          }
        }}
      >
        <p className="wb-tour__count num">
          {idx + 1} of {n}
        </p>
        <h2 id={`${ids}-title`} className="wb-tour__title">
          {step.title}
        </h2>
        <p id={`${ids}-body`} className="wb-tour__body">
          {step.body}
        </p>
        {missing && <p className="wb-tour__missing">This part of the workbench is not on screen yet. Next moves on.</p>}
        <div className="wb-tour__dots" aria-hidden="true">
          {steps.map((s, k) => (
            <i key={s.target + k} className={k === idx ? "is-on" : k < idx ? "is-done" : undefined} />
          ))}
        </div>
        <div className="wb-tour__actions">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => finish(false)}>
            Skip tour
          </button>
          <span className="wb-spacer" />
          <button type="button" className="btn btn-outline btn-small" onClick={() => go(idx - 1)} disabled={idx === 0}>
            Back
          </button>
          <button ref={nextRef} type="button" className="btn btn-small" onClick={() => (isLast ? finish(true) : go(idx + 1))}>
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
        <p className="wb-tour__hint">Arrow keys move between steps. Esc skips.</p>
        <div className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Opens the tour once for first-time visitors. Returns [open, setOpen].
 * Pass `ready` false until the workbench has rendered its tour targets.
 * Closing marks the tour as seen in localStorage (best effort; a blocked
 * storage just means the tour may show again next visit).
 */
export function useTourAutostart(storageKey: string, ready = true): [boolean, (open: boolean) => void] {
  // Server and hydration read as "seen", so the tour never flashes during SSR.
  const seen = useStoredString(storageKey) != null;
  const hydrated = useMounted();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? (hydrated && ready && !seen);
  const setOpen = useCallback(
    (v: boolean) => {
      setChoice(v);
      if (!v && !hasSeenTour(storageKey)) markTourSeen(storageKey, false);
    },
    [storageKey],
  );
  return [open, setOpen];
}
