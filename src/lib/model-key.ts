/**
 * Per-browser storage for a visitor's own model key. The key lives only in this
 * browser's localStorage and is sent only to the provider the visitor picked.
 * Every access is wrapped because storage can be blocked or missing.
 */
import type { BrowserModelConfig } from "@/lib/engine/providers/browser";

export const MODEL_CONFIG_STORAGE_KEY = "assay.modelConfig.v1";
/** Fired on window after a save or clear so other mounted components can resync. */
export const MODEL_CONFIG_EVENT = "assay:model-config";

function parse(raw: unknown): BrowserModelConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.provider !== "anthropic" && r.provider !== "openai") return null;
  if (typeof r.apiKey !== "string" || !r.apiKey.trim()) return null;
  if (typeof r.model !== "string") return null;
  const cfg: BrowserModelConfig = { provider: r.provider, apiKey: r.apiKey, model: r.model };
  if (typeof r.baseUrl === "string" && r.baseUrl.trim()) cfg.baseUrl = r.baseUrl.trim();
  return cfg;
}

function notify(cfg: BrowserModelConfig | null) {
  try {
    window.dispatchEvent(new CustomEvent(MODEL_CONFIG_EVENT, { detail: cfg }));
  } catch {
    // no window or CustomEvent; nothing to notify
  }
}

export function loadModelConfig(): BrowserModelConfig | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveModelConfig(cfg: BrowserModelConfig): boolean {
  try {
    const clean = parse(cfg);
    if (!clean) return false;
    window.localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(clean));
    notify(clean);
    return true;
  } catch {
    return false;
  }
}

export function clearModelConfig(): void {
  try {
    window.localStorage.removeItem(MODEL_CONFIG_STORAGE_KEY);
  } catch {
    // storage blocked; nothing stored to clear
  }
  notify(null);
}
