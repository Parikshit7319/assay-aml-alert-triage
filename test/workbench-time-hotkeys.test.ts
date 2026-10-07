import { describe, expect, it } from "vitest";
import {
  comboLabel,
  comboParts,
  createSequenceMatcher,
  DEFAULT_SHORTCUTS,
  isEditableTarget,
  isInteractiveTarget,
  normalizeCombo,
  normalizeKey,
  SHORTCUT_KEYS,
} from "@/components/workbench/hotkeys";
import { daysSince, daysUntil, formatLocal, formatRelative, zoneAbbreviation } from "@/components/workbench/time-format";

const d = new Date("2026-10-07T20:05:00Z");

describe("formatLocal", () => {
  it("formats in a given zone with its abbreviation", () => {
    expect(formatLocal(d, "datetime", "America/Chicago")).toBe("Oct 7, 2026, 3:05 PM CDT");
    expect(formatLocal(d, "time", "UTC")).toBe("8:05 PM UTC");
    expect(formatLocal(d, "date", "Asia/Tokyo")).toBe("Oct 8, 2026");
    expect(formatLocal(d.toISOString(), "datetime", "UTC")).toBe("Oct 7, 2026, 8:05 PM UTC");
  });

  it("formats relative to a given now", () => {
    expect(formatLocal(d, "relative", "UTC", new Date(d.getTime() + 2 * 60_000))).toBe("2 min ago");
  });

  it("never prints Invalid Date", () => {
    expect(formatLocal("not a date", "datetime", "UTC")).toBe("unknown date");
  });

  it("names the zone", () => {
    expect(zoneAbbreviation(d, "UTC")).toBe("UTC");
    expect(zoneAbbreviation(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe("EST");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const off = (ms: number) => new Date(now.getTime() + ms);
  it("reads like a queue", () => {
    expect(formatRelative(off(-20_000), now)).toBe("just now");
    expect(formatRelative(off(70_000), now)).toBe("just now");
    expect(formatRelative(off(5 * 60_000), now)).toBe("in 5 min");
    expect(formatRelative(off(-60_000), now)).toBe("1 min ago");
    expect(formatRelative(off(-5 * 3_600_000), now)).toBe("5 h ago");
    expect(formatRelative(off(-30 * 3_600_000), now)).toBe("yesterday");
    expect(formatRelative(off(3 * 86_400_000), now)).toBe("in 3 days");
    expect(formatRelative(off(-90 * 86_400_000), now)).toBe("3 months ago");
    expect(formatRelative(off(-800 * 86_400_000), now)).toBe("2 years ago");
  });

  it("counts whole days the same way as labels.ts", () => {
    expect(daysUntil(off(2.2 * 86_400_000), now)).toBe(3);
    expect(daysUntil(off(-1.5 * 86_400_000), now)).toBe(-1);
    expect(daysSince(off(-2.9 * 86_400_000), now)).toBe(2);
    expect(daysSince(off(5_000), now)).toBe(0);
  });
});

describe("normalizeKey", () => {
  it("lowercases letters and names special keys", () => {
    expect(normalizeKey({ key: "J" })).toBe("j");
    expect(normalizeKey({ key: "Enter" })).toBe("enter");
    expect(normalizeKey({ key: " " })).toBe("space");
    expect(normalizeKey({ key: "Escape" })).toBe("escape");
    expect(normalizeKey({ key: "/" })).toBe("/");
  });

  it("drops chords except shift plus / for ?", () => {
    expect(normalizeKey({ key: "c", metaKey: true })).toBeNull();
    expect(normalizeKey({ key: "c", ctrlKey: true })).toBeNull();
    expect(normalizeKey({ key: "e", altKey: true })).toBeNull();
    expect(normalizeKey({ key: "J", shiftKey: true })).toBeNull();
    expect(normalizeKey({ key: "?", shiftKey: true })).toBe("?");
    expect(normalizeKey({ key: "/", shiftKey: true })).toBe("?");
  });
});

describe("targets", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: (n: string) => (extra[n] as string) ?? null, ...extra });
  it("treats text fields as editable and buttons as not", () => {
    expect(isEditableTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isEditableTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(el("SELECT"))).toBe(true);
    expect(isEditableTarget(el("DIV", { isContentEditable: true }))).toBe(true);
    expect(isEditableTarget(el("DIV", { role: "textbox" }))).toBe(true);
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("knows where Enter already does something", () => {
    expect(isInteractiveTarget(el("A"))).toBe(true);
    expect(isInteractiveTarget(el("DIV", { role: "button" }))).toBe(true);
    expect(isInteractiveTarget(el("BODY"))).toBe(false);
  });
});

describe("createSequenceMatcher", () => {
  const combos = Object.values(SHORTCUT_KEYS);

  it("fires single keys straight away", () => {
    const m = createSequenceMatcher(combos);
    expect(m.feed("j", 0)).toBe("j");
    expect(m.feed("?", 10)).toBe("?");
    expect(m.feed("x", 20)).toBeNull();
  });

  it("matches G then Q within the timeout", () => {
    const m = createSequenceMatcher(combos, 1000);
    expect(m.feed("g", 0)).toBeNull();
    expect(m.pending).toBe("g");
    expect(m.feed("q", 500)).toBe("g q");
    expect(m.pending).toBeNull();
  });

  it("drops a stale prefix and handles the next key on its own", () => {
    const m = createSequenceMatcher(combos, 1000);
    m.feed("g", 0);
    expect(m.feed("q", 1500)).toBeNull();
    m.feed("g", 2000);
    expect(m.feed("j", 2100)).toBe("j");
  });

  it("accepts spelled-out combos", () => {
    expect(normalizeCombo("G then Q")).toBe("g q");
    expect(normalizeCombo("shift+/")).toBe("?");
    expect(normalizeCombo("Esc")).toBe("escape");
    const m = createSequenceMatcher(["G then Q"]);
    m.feed("g", 0);
    expect(m.feed("q", 1)).toBe("g q");
  });
});

describe("shortcut docs", () => {
  it("labels combos for people", () => {
    expect(comboParts("g q")).toEqual(["G", "Q"]);
    expect(comboLabel("g q")).toBe("G then Q");
    expect(comboParts("enter")).toEqual(["Enter"]);
    expect(comboParts("?")).toEqual(["?"]);
  });

  it("documents every default binding exactly once", () => {
    const documented = DEFAULT_SHORTCUTS.flatMap((g) => g.keys.map((k) => k.combo));
    for (const combo of Object.values(SHORTCUT_KEYS)) expect(documented.filter((c) => c === combo)).toHaveLength(1);
  });
});
