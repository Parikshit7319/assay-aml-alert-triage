"use client";

import { useMemo } from "react";
import { formatLocal, isValidDate, toDate, type TimeFormat } from "./time-format";
import { useClock, useMounted } from "./overlay";

export { formatLocal, formatRelative, type TimeFormat } from "./time-format";

/** Current time, refreshed every `intervalMs` after mount. Null on the server and the first client render. */
export function useNow(intervalMs = 60_000, enabled = true): Date | null {
  const ms = useClock(intervalMs, enabled);
  return useMemo(() => (ms == null ? null : new Date(ms)), [ms]);
}

export interface TimeProps {
  value: string | Date;
  format?: TimeFormat;
  className?: string;
}

/**
 * A <time> element in the viewer's own time zone, with the zone abbreviation
 * ("Oct 7, 2026, 3:05 PM CDT"). The server and the first client render show
 * UTC so hydration matches; local time takes over after mount. The relative
 * format ("5 min ago") refreshes every minute and keeps the absolute local
 * time in the title.
 */
export function Time({ value, format = "datetime", className }: TimeProps) {
  const mounted = useMounted();
  const now = useNow(60_000, format === "relative");
  const d = toDate(value);
  if (!isValidDate(d)) return <span className={className}>unknown date</span>;
  const iso = d.toISOString();
  const local = mounted;
  const text =
    format === "relative"
      ? local && now
        ? formatLocal(d, "relative", undefined, now)
        : formatLocal(d, "datetime", "UTC")
      : formatLocal(d, format, local ? undefined : "UTC");
  const title = formatLocal(d, "datetime", local ? undefined : "UTC");
  return (
    <time dateTime={iso} title={title} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
