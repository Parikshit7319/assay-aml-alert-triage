/**
 * Saves demo state in the visitor's browser so a refresh does not wipe their
 * work. Best effort only: private mode, a full quota or disabled storage all
 * fail quietly and the demo simply starts fresh.
 */

/** Bump when the stored shape changes; older saves are then ignored. */
export const DEMO_STATE_VERSION = 1;

/** Browsers cap localStorage near 5 MB per origin; stay under it with room for other keys. */
export const MAX_STATE_BYTES = 4.5 * 1024 * 1024;

interface Envelope<T> {
  v: number;
  savedAt: string;
  data: T;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const DATE_KEYS = new Set(["createdAt", "ts", "openedAt", "onboardedAt", "startedAt"]);

function isDateKey(key: string): boolean {
  return DATE_KEYS.has(key) || key.endsWith("At") || key.endsWith("ts") || key.endsWith("Ts");
}

/** JSON.parse reviver: turns full ISO 8601 datetime strings under date-like keys back into Date objects. */
export function reviveDates(key: string, value: unknown): unknown {
  if (typeof value === "string" && isDateKey(key) && ISO_DATETIME.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return value;
}

function storage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

/** Serialises and stores `state`. Returns false if storage is unavailable, the payload is over 4.5 MB, or the write fails. */
export function saveDemoState(key: string, state: unknown, version: number = DEMO_STATE_VERSION): boolean {
  try {
    const ls = storage();
    if (!ls) return false;
    const envelope: Envelope<unknown> = { v: version, savedAt: new Date().toISOString(), data: state };
    const json = JSON.stringify(envelope);
    // localStorage quotas count UTF-16 code units; the demo state is almost all ASCII.
    if (json.length + key.length > MAX_STATE_BYTES) return false;
    ls.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

/** Reads state saved by saveDemoState. Returns null when missing, unreadable, or saved under another version. */
export function loadDemoState<T>(key: string, version: number = DEMO_STATE_VERSION): T | null {
  try {
    const ls = storage();
    if (!ls) return null;
    const raw = ls.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw, reviveDates) as Partial<Envelope<T>> | null;
    if (!parsed || typeof parsed !== "object" || parsed.v !== version || !("data" in parsed)) return null;
    return (parsed.data ?? null) as T | null;
  } catch {
    return null;
  }
}

export function clearDemoState(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Storage disabled: nothing to clear.
  }
}
