/**
 * Pure date formatting for the workbench. No React, no DOM, so it can be unit
 * tested and used on the server. Pass `tz` to pin a time zone (the server
 * renders UTC); leave it out to use the viewer's own zone.
 */

export type TimeFormat = "datetime" | "date" | "time" | "relative";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", opts);
    fmtCache.set(key, f);
  }
  return f;
}

/** Short zone name for a date in a zone, for example "CDT", "GMT+5:30" or "UTC". */
export function zoneAbbreviation(d: Date, tz?: string): string {
  const part = dtf({ timeZone: tz, timeZoneName: "short", hour: "numeric" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? (tz ?? "");
}

/**
 * "5 min ago", "in 3 days", "just now". Rounds the way people read a queue:
 * under a minute is "just now", then minutes, hours, days, months, years.
 */
export function formatRelative(value: string | number | Date, now: Date = new Date()): string {
  const d = toDate(value);
  if (!isValidDate(d)) return "unknown time";
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  // A shared clock can lag by up to its tick; a time slightly "in the future" was just now.
  if (abs < 45_000 || (diff > 0 && diff < 90_000)) return "just now";
  const past = diff < 0;
  const say = (n: number, unit: string, plural = `${unit}s`) => {
    const text = `${n} ${n === 1 ? unit : plural}`;
    return past ? `${text} ago` : `in ${text}`;
  };
  if (abs < HOUR) return say(Math.max(1, Math.round(abs / MINUTE)), "min", "min");
  if (abs < DAY) return say(Math.round(abs / HOUR), "h", "h");
  const days = Math.round(abs / DAY);
  if (days === 1) return past ? "yesterday" : "tomorrow";
  if (abs < 45 * DAY) return say(days, "day");
  if (abs < 365 * DAY) return say(Math.round(abs / (30 * DAY)), "month");
  return say(Math.round(abs / (365 * DAY)), "year");
}

/**
 * Formats a date for display. `datetime` and `time` carry the zone
 * abbreviation; `date` does not; `relative` is measured from `now`.
 * Invalid input returns "unknown date" rather than "Invalid Date".
 */
export function formatLocal(value: string | number | Date, format: TimeFormat = "datetime", tz?: string, now?: Date): string {
  const d = toDate(value);
  if (!isValidDate(d)) return "unknown date";
  switch (format) {
    case "relative":
      return formatRelative(d, now ?? new Date());
    case "date":
      return dtf({ timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(d);
    case "time":
      return dtf({ timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
    case "datetime":
    default:
      return dtf({ timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  }
}

/** Whole days from now until `due`, rounded up; negative when past due. Same rule as daysLeft in labels.ts. */
export function daysUntil(due: string | number | Date, now: Date = new Date()): number {
  return Math.ceil((toDate(due).getTime() - now.getTime()) / DAY);
}

/** Whole days since `from`, rounded down, never negative. */
export function daysSince(from: string | number | Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - toDate(from).getTime()) / DAY));
}
