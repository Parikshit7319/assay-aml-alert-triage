"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/viz/Icon";
import { useNow } from "./Time";
import { formatLocal, formatRelative } from "./time-format";
import "./workbench.css";

export interface ResetDemoButtonProps {
  onReset: () => void;
  /** Button text. Defaults to "Reset demo". */
  label?: string;
}

/**
 * Reset with an inline confirm step instead of window.confirm. Focus moves to
 * "Keep my work" (the safe choice), Esc cancels, and focus returns to the
 * reset button after cancelling.
 */
export function ResetDemoButton({ onReset, label = "Reset demo" }: ResetDemoButtonProps) {
  const ids = useId();
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (wasConfirming.current) trigger.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!confirming) {
    return (
      <button ref={trigger} type="button" className="btn btn-quiet btn-small wb-reset" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }
  return (
    <div
      className="wb-confirm"
      role="group"
      aria-labelledby={`${ids}-q`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setConfirming(false);
        }
      }}
    >
      <span id={`${ids}-q`}>Discard your decisions, notes and imports, and start a fresh workspace?</span>
      <button
        type="button"
        className="btn btn-danger btn-small"
        onClick={() => {
          wasConfirming.current = false;
          setConfirming(false);
          onReset();
        }}
      >
        Reset
      </button>
      <button ref={keep} type="button" className="btn btn-quiet btn-small" onClick={() => setConfirming(false)}>
        Keep my work
      </button>
    </div>
  );
}

export interface SavedIndicatorProps {
  savedAt: Date | null;
  /** Shown when savedAt is null. Defaults to "Not saved yet". */
  emptyText?: string;
}

/** "Saved in this browser, 2 min ago", refreshed every 30 seconds, with the exact local time in the title. */
export function SavedIndicator({ savedAt, emptyText = "Not saved yet" }: SavedIndicatorProps) {
  const now = useNow(30_000, !!savedAt);
  if (!savedAt) {
    return <span className="wb-saved wb-saved--none">{emptyText}</span>;
  }
  const rel = now ? formatRelative(savedAt, now) : "just now";
  return (
    <span className="wb-saved" title={now ? `Saved ${formatLocal(savedAt, "datetime")}` : undefined}>
      <Icon name="check" size={14} />
      <span>
        Saved in this browser, <time dateTime={savedAt.toISOString()}>{rel}</time>
      </span>
    </span>
  );
}
