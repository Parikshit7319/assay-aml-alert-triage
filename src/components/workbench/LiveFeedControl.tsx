"use client";

import { useId } from "react";
import { Icon } from "@/components/viz/Icon";
import "./workbench.css";

export const LIVE_FEED_RATES = [10, 20, 45] as const;

export interface LiveFeedControlProps {
  running: boolean;
  onToggle: () => void;
  /** Seconds between new alerts. */
  rateSec: number;
  onRate: (sec: number) => void;
  /** Alerts that have arrived since the feed started. */
  arrived: number;
}

/**
 * Toolbar control for the demo's live alert feed: a play and pause toggle
 * (aria-pressed), a rate picker, a pulsing dot while running (a still dot
 * under reduced motion) and a polite count of arrivals.
 */
export function LiveFeedControl({ running, onToggle, rateSec, onRate, arrived }: LiveFeedControlProps) {
  const id = useId();
  const rates: number[] = LIVE_FEED_RATES.includes(rateSec as (typeof LIVE_FEED_RATES)[number]) ? [...LIVE_FEED_RATES] : [...LIVE_FEED_RATES, rateSec].sort((a, b) => a - b);
  return (
    <div className={`wb-live ${running ? "is-running" : ""}`} role="group" aria-label="Live alert feed">
      {/* The name stays "Live feed"; aria-pressed carries on and off, so the label never flips. */}
      <button type="button" className="wb-live__toggle" aria-pressed={running} onClick={onToggle} title={running ? "Pause the live feed" : "Start the live feed"}>
        <span className="wb-live__dot" aria-hidden="true" />
        <Icon name={running ? "pause" : "play"} size={16} />
        <span>Live feed</span>
        <span className="wb-live__state" aria-hidden="true">
          {running ? "on" : "off"}
        </span>
      </button>
      <label className="wb-live__rate" htmlFor={id}>
        <span className="visually-hidden">New alert every</span>
        <select id={id} value={rateSec} onChange={(e) => onRate(Number(e.target.value))}>
          {rates.map((r) => (
            <option key={r} value={r}>
              Every {r} s
            </option>
          ))}
        </select>
      </label>
      <span className="wb-live__count num" aria-live="polite" aria-atomic="true">
        {arrived} new
        <span className="visually-hidden"> {arrived === 1 ? "alert has" : "alerts have"} arrived</span>
      </span>
    </div>
  );
}
