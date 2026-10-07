"use client";

/**
 * Shared overlay plumbing for the workbench: focus trapping, focus return,
 * outside-click and Escape dismissal, and a small modal shell. Every overlay
 * in this folder uses these so they behave the same way.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./workbench.css";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("inert") && el.getClientRects().length > 0 && !el.closest("[hidden]"));
}

/** useLayoutEffect on the client, nothing on the server (avoids the SSR warning). */
export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const noopSubscribe = () => () => {};

/**
 * False on the server and during hydration, true once the client has taken
 * over. Use it to switch from server-stable output (UTC) to local output.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    () => false,
  );
}

/* A shared ticking clock per interval, so a page full of relative times uses one timer. */
const clocks = new Map<number, { now: number; subs: Set<() => void>; timer?: ReturnType<typeof setInterval> }>();
function clockFor(intervalMs: number) {
  let c = clocks.get(intervalMs);
  if (!c) {
    c = { now: Date.now(), subs: new Set() };
    clocks.set(intervalMs, c);
  }
  return c;
}

/** Current time in ms, refreshed every `intervalMs` while mounted. Null on the server and during hydration. */
export function useClock(intervalMs = 60_000, enabled = true): number | null {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!enabled) return () => {};
      const c = clockFor(intervalMs);
      c.subs.add(cb);
      if (c.subs.size === 1) {
        c.now = Date.now();
        c.timer = setInterval(() => {
          c.now = Date.now();
          c.subs.forEach((f) => f());
        }, intervalMs);
      }
      return () => {
        c.subs.delete(cb);
        if (!c.subs.size && c.timer) clearInterval(c.timer);
      };
    },
    [intervalMs, enabled],
  );
  return useSyncExternalStore(
    subscribe,
    () => (enabled ? clockFor(intervalMs).now : null),
    () => null,
  );
}

const STORAGE_EVENT = "wb-storage";

function subscribeStorage(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  window.addEventListener(STORAGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STORAGE_EVENT, cb);
  };
}

export function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes localStorage and tells every useStoredString reader in this tab. Returns false when storage is blocked. */
export function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value == null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(STORAGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** The raw localStorage string for `key`, live across tabs. Null on the server, during hydration, or when storage is blocked. */
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );
}

/**
 * While `active`, keeps Tab inside `ref`, calls `onEscape` on Escape, moves
 * focus in on activation and returns it to whatever had focus before (the
 * trigger) on deactivation.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  opts: { onEscape?: () => void; initialFocus?: RefObject<HTMLElement | null>; returnFocus?: boolean } = {},
) {
  const onEscape = useRef(opts.onEscape);
  const initial = opts.initialFocus;
  const returnFocus = opts.returnFocus ?? true;
  useEffect(() => {
    onEscape.current = opts.onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = initial?.current ?? focusableIn(root)[0] ?? root;
    // Focus after paint so a portal or a transition has its layout.
    const raf = requestAnimationFrame(() => first.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape.current) {
        e.stopPropagation();
        e.preventDefault();
        onEscape.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusableIn(root);
      if (!items.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === firstEl || !root.contains(cur))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (cur === lastEl || !root.contains(cur))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("keydown", onKey);
      if (returnFocus && previous && previous.isConnected && typeof previous.focus === "function") {
        previous.focus({ preventScroll: true });
      }
    };
  }, [active, ref, initial, returnFocus]);
}

/**
 * Closes a popover on outside pointer down or Escape. Focus goes back to
 * `returnTo` on Escape. Clicks inside `ref` or on `returnTo` (the trigger,
 * which toggles itself) are ignored.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, returnTo?: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t) || returnTo?.current?.contains(t)) return;
      close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
      returnTo?.current?.focus();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && !ref.current?.contains(next) && !returnTo?.current?.contains(next)) close.current();
    };
    const el = ref.current;
    document.addEventListener("pointerdown", onDown, true);
    el?.addEventListener("keydown", onKey);
    returnTo?.current?.addEventListener("keydown", onKey);
    el?.addEventListener("focusout", onFocusOut);
    const trigger = returnTo?.current;
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      el?.removeEventListener("keydown", onKey);
      trigger?.removeEventListener("keydown", onKey);
      el?.removeEventListener("focusout", onFocusOut);
    };
  }, [open, ref, returnTo]);
}

/** Locks page scroll while mounted and `active`. Restores the previous overflow value. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [active]);
}

export function Portal({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Short line under the title, used as the dialog description. */
  description?: string;
  children: ReactNode;
  /** Extra class on the dialog box, for width variants such as "wb-modal--wide". */
  className?: string;
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Accessible modal: role="dialog", aria-modal, labelled by its title, focus
 * trapped inside, Escape and the backdrop close it, focus returns to the
 * element that opened it.
 */
export function Modal({ open, onClose, title, description, children, className, initialFocus }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const mounted = useMounted();
  useFocusTrap(ref, open && mounted, { onEscape: onClose, initialFocus });
  useScrollLock(open && mounted);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="wb-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`wb-modal ${className ?? ""}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined} tabIndex={-1}>
        <div className="wb-modal__head">
          <h2 id={`${id}-t`}>{title}</h2>
          <button type="button" className="wb-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </div>
        {description && (
          <p id={`${id}-d`} className="wb-modal__desc">
            {description}
          </p>
        )}
        <div className="wb-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
