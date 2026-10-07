/** Toast list rules. Pure, so the stacking behaviour can be tested without a DOM. */

export type ToastTone = "ok" | "info" | "warn" | "error";

export interface ToastOptions {
  title: string;
  body?: string;
  tone?: ToastTone;
  action?: { label: string; onClick(): void };
  /** Milliseconds before the toast hides itself. 0 or Infinity keeps it until dismissed. */
  durationMs?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  durationMs: number;
}

export const MAX_VISIBLE_TOASTS = 3;

export const TONE_WORD: Record<ToastTone, string> = {
  ok: "Done",
  info: "Note",
  warn: "Warning",
  error: "Error",
};

/** Errors and toasts with an action stay longer, since they ask for attention. */
export function defaultDuration(tone: ToastTone, hasAction: boolean): number {
  if (tone === "error") return 10_000;
  if (hasAction || tone === "warn") return 8_000;
  return 5_000;
}

export function makeToast(id: number, opts: ToastOptions): ToastItem {
  const tone = opts.tone ?? "info";
  const d = opts.durationMs;
  return { ...opts, id, tone, durationMs: d == null ? defaultDuration(tone, !!opts.action) : d > 0 ? d : Infinity };
}

/**
 * Adds a toast and keeps at most `max`. When over the limit the oldest
 * non-error toast goes first; errors are only dropped when every toast is one.
 */
export function pushToast(list: readonly ToastItem[], item: ToastItem, max = MAX_VISIBLE_TOASTS): ToastItem[] {
  const next = [...list, item];
  while (next.length > max) {
    const i = next.findIndex((t) => t.tone !== "error");
    next.splice(i >= 0 ? i : 0, 1);
  }
  return next;
}

export function dismissToast(list: readonly ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id);
}
