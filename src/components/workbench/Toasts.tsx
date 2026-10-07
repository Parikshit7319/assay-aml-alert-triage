"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/viz/Icon";
import { dismissToast, makeToast, MAX_VISIBLE_TOASTS, pushToast, TONE_WORD, type ToastItem, type ToastOptions, type ToastTone } from "./toast-queue";
import "./workbench.css";

export type { ToastOptions, ToastTone } from "./toast-queue";

interface ToastApi {
  /** Shows a toast and returns its id. */
  toast(opts: ToastOptions): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = { ok: "close", info: "bell", warn: "review", error: "escalate" };

let warned = false;
const NOOP: ToastApi = {
  toast: (o) => {
    if (process.env.NODE_ENV !== "production" && !warned) {
      warned = true;
      console.warn(`useToast() was called outside <ToastProvider>; "${o.title}" was not shown.`);
    }
    return 0;
  },
  dismiss: () => {},
};

/** `const { toast } = useToast(); toast({ title: "Closed", tone: "ok" })`. Safe outside a provider (does nothing). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

function ToastCard({ item, paused, onDismiss }: { item: ToastItem; paused: boolean; onDismiss: (id: number, viaKeyboard?: boolean) => void }) {
  const remaining = useRef(item.durationMs);
  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return;
    const started = Date.now();
    const t = window.setTimeout(() => onDismiss(item.id), Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - started;
    };
  }, [paused, item.id, onDismiss]);

  return (
    <li
      className={`wb-toast wb-toast--${item.tone}`}
      data-toast-id={item.id}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDismiss(item.id, true);
        }
      }}
    >
      <span className="wb-toast__icon" aria-hidden="true">
        <Icon name={TONE_ICON[item.tone]} size={18} />
      </span>
      <div className="wb-toast__text">
        <p className="wb-toast__title">
          <span className="visually-hidden">{TONE_WORD[item.tone]}: </span>
          {item.title}
        </p>
        {item.body && <p className="wb-toast__body">{item.body}</p>}
        {item.action && (
          <button
            type="button"
            className="wb-toast__action"
            onClick={() => {
              item.action!.onClick();
              onDismiss(item.id, true);
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button type="button" className="wb-icon-btn wb-toast__close" onClick={() => onDismiss(item.id, true)} aria-label={`Dismiss: ${item.title}`}>
        <Icon name="x" size={16} />
      </button>
    </li>
  );
}

/**
 * Holds the toast stack. Wrap the workbench once (DemoApp root, or the /app
 * layout's client shell). Toasts stack bottom right, full width at the bottom
 * on phones, at most three at a time; hovering or focusing the stack pauses
 * the timers. Polite announcements for most tones, assertive for errors.
 */
export function ToastProvider({ children, max = MAX_VISIBLE_TOASTS }: { children: ReactNode; max?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const nextId = useRef(1);
  const listRef = useRef<HTMLOListElement>(null);

  const announce = useCallback((t: ToastItem) => {
    const text = `${TONE_WORD[t.tone]}: ${t.title}${t.body ? `. ${t.body}` : ""}`;
    const set = t.tone === "error" ? setAssertive : setPolite;
    // Clear first so the same message twice is still announced.
    set("");
    window.setTimeout(() => set(text), 60);
  }, []);

  const dismiss = useCallback((id: number, viaKeyboard = false) => {
    if (viaKeyboard && listRef.current?.contains(document.activeElement)) {
      // Keep keyboard users in the stack: move to a neighbour's dismiss button, if there is one.
      const cards = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-toast-id]") ?? [])];
      const i = cards.findIndex((c) => c.dataset.toastId === String(id));
      const neighbour = cards[i + 1] ?? cards[i - 1];
      neighbour?.querySelector<HTMLElement>(".wb-toast__close")?.focus();
    }
    setItems((list) => dismissToast(list, id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const item = makeToast(nextId.current++, opts);
      setItems((list) => pushToast(list, item, max));
      announce(item);
      return item.id;
    },
    [announce, max],
  );

  const api = useMemo<ToastApi>(() => ({ toast, dismiss: (id) => dismiss(id) }), [toast, dismiss]);
  // An emptied stack cannot report pointer leave or blur, so reset the pause state as it empties.
  if (items.length === 0 && (hover || focusWithin)) {
    setHover(false);
    setFocusWithin(false);
  }
  const paused = hover || focusWithin;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      <section className="wb-toasts" aria-label="Notifications" hidden={!items.length}>
        <ol
          ref={listRef}
          className="wb-toasts__list"
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onFocus={() => setFocusWithin(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
          }}
        >
          {items.map((t) => (
            <ToastCard key={t.id} item={t} paused={paused} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}
