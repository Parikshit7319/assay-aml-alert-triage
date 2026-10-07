"use client";

import { useEffect, useRef } from "react";
import { createSequenceMatcher, isEditableTarget, isInteractiveTarget, normalizeCombo, normalizeKey } from "./hotkeys";

export { DEFAULT_SHORTCUTS, SHORTCUT_KEYS, comboLabel, comboParts, type ShortcutGroup } from "./hotkeys";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** True when the event comes from inside a modal or a native dialog, where page shortcuts must not fire. */
function insideModal(target: EventTarget | null): boolean {
  const el = target as Element | null;
  return !!el && typeof el.closest === "function" && !!el.closest('[aria-modal="true"], dialog, [data-hotkeys="off"]');
}

/**
 * Binds single-key and two-key shortcuts on window. Keys typed into inputs,
 * textareas, selects and contenteditable are ignored, as are Ctrl, Cmd and Alt
 * chords and Shift (except "?"). Enter and Space are left alone on links and
 * buttons so they keep their native behaviour. Shortcuts pause inside modals.
 *
 * useHotkeys({ j: next, k: prev, "g q": toQueue, "?": () => setHelp(true) })
 *
 * The handler map can change every render; the listener is bound once.
 */
export function useHotkeys(map: HotkeyMap, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const mapRef = useRef<Record<string, (e: KeyboardEvent) => void>>({});
  const signature = Object.keys(map).map(normalizeCombo).sort().join("|");

  useEffect(() => {
    const normalized: Record<string, (e: KeyboardEvent) => void> = {};
    for (const [combo, fn] of Object.entries(map)) normalized[normalizeCombo(combo)] = fn;
    mapRef.current = normalized;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const matcher = createSequenceMatcher(signature ? signature.split("|") : []);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (isEditableTarget(e.target) || insideModal(e.target)) {
        matcher.reset();
        return;
      }
      const key = normalizeKey(e);
      if (!key) {
        matcher.reset();
        return;
      }
      if ((key === "enter" || key === "space") && isInteractiveTarget(e.target)) return;
      const combo = matcher.feed(key, performance.now());
      if (!combo) return;
      const fn = mapRef.current[combo];
      if (!fn) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, signature]);
}
