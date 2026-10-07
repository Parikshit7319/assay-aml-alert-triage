"use client";

import { useSyncExternalStore } from "react";
import type { BrowserModelConfig } from "@/lib/engine/providers/browser";
import { loadModelConfig, MODEL_CONFIG_EVENT, MODEL_CONFIG_STORAGE_KEY } from "@/lib/model-key";

let cachedRaw: string | null | undefined;
let cached: BrowserModelConfig | null = null;

function snapshot(): BrowserModelConfig | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = loadModelConfig();
  }
  return cached;
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === MODEL_CONFIG_STORAGE_KEY) cb();
  };
  window.addEventListener(MODEL_CONFIG_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MODEL_CONFIG_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The visitor's own model key, kept in this browser only. Null when none is saved. */
export function useModelConfig(): BrowserModelConfig | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
