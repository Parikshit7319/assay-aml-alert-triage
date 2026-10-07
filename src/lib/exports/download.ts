/**
 * Browser download helpers. Safe to import anywhere; they only touch the DOM
 * when called, and throw a clear error if called on the server.
 */

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Downloads are only available in the browser.");
  }
}

/** Saves a Blob as a file through a temporary object URL. */
export function downloadBlob(filename: string, blob: Blob): void {
  assertBrowser();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves text as a file. CSV files get a UTF-8 byte order mark by default so
 * Excel reads accented names correctly; pass `bom: false` to skip it.
 */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
  opts: { bom?: boolean } = {},
): void {
  const type = mime.includes("charset") ? mime : `${mime};charset=utf-8`;
  const bom = opts.bom ?? type.startsWith("text/csv");
  downloadBlob(filename, new Blob([bom ? "﻿" : "", text], { type }));
}

/** A filesystem-safe filename stem, for example "sar-draft-ALT-1234". */
export function safeFilename(stem: string): string {
  return stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "export";
}
