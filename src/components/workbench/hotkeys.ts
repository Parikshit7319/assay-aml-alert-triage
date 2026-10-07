/**
 * Keyboard shortcut rules for the workbench. Pure: the React hook in
 * useHotkeys.ts wires these to window keydown events.
 *
 * Combo syntax: a single key name ("j", "enter", "/", "?", "escape"), or a
 * two-key sequence separated by a space ("g q" means press G, then Q).
 */

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

const NAMED: Record<string, string> = {
  " ": "space",
  spacebar: "space",
  esc: "escape",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
};

/**
 * Normalised key name for an event, or null when the event should not trigger
 * a shortcut: any Ctrl, Cmd or Alt chord, and Shift with anything except "?"
 * (which is Shift and / on most layouts).
 */
export function normalizeKey(e: KeyLike): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const raw = e.key ?? "";
  if (raw === "?" || (e.shiftKey && raw === "/")) return "?";
  if (e.shiftKey) return null;
  if (!raw || raw === "Unidentified" || raw === "Dead") return null;
  const k = raw.toLowerCase();
  return NAMED[k] ?? k;
}

/** Normalises a combo string from a shortcut map: "G then Q", "g q" and "G Q" all become "g q"; "shift+/" becomes "?". */
export function normalizeCombo(combo: string): string {
  return combo
    .trim()
    .toLowerCase()
    .replace(/\s+then\s+/g, " ")
    .split(/\s+/)
    .map((k) => (k === "shift+/" ? "?" : (NAMED[k] ?? k)))
    .join(" ");
}

interface TargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "color", "range", "image"]);

/** True for elements that take typed text: text inputs, textareas, selects, contenteditable and ARIA textboxes. */
export function isEditableTarget(target: unknown): boolean {
  const t = target as TargetLike | null;
  if (!t || typeof t !== "object") return false;
  const tag = (t.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has((t.type ?? "text").toLowerCase());
  if (t.isContentEditable) return true;
  const role = t.getAttribute?.("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox" || role === "spinbutton") return true;
  return false;
}

/** True for elements where Enter or Space already does something (links, buttons, summaries, menu items). */
export function isInteractiveTarget(target: unknown): boolean {
  const t = target as TargetLike | null;
  if (!t || typeof t !== "object") return false;
  const tag = (t.tagName ?? "").toUpperCase();
  if (tag === "A" || tag === "BUTTON" || tag === "SUMMARY" || tag === "INPUT" || tag === "LABEL") return true;
  const role = t.getAttribute?.("role") ?? "";
  return ["button", "link", "menuitem", "option", "tab", "checkbox", "radio", "switch", "treeitem"].includes(role);
}

/**
 * Turns single key names into fired combos, handling two-key sequences.
 * `feed` returns the combo to run, or null. A sequence prefix ("g") waits up
 * to `timeoutMs` for its second key; if the next key does not complete a
 * sequence it is matched on its own.
 */
export function createSequenceMatcher(combos: Iterable<string>, timeoutMs = 1200) {
  const all = new Set([...combos].map(normalizeCombo));
  const prefixes = new Set<string>();
  for (const c of all) {
    const parts = c.split(" ");
    if (parts.length === 2) prefixes.add(parts[0]);
  }
  let pending: { key: string; at: number } | null = null;

  return {
    /** True while a sequence prefix is waiting for its second key. */
    get pending(): string | null {
      return pending?.key ?? null;
    },
    reset() {
      pending = null;
    },
    feed(key: string, now: number): string | null {
      if (pending && now - pending.at <= timeoutMs) {
        const seq = `${pending.key} ${key}`;
        pending = null;
        if (all.has(seq)) return seq;
      } else {
        pending = null;
      }
      if (prefixes.has(key)) {
        pending = { key, at: now };
        // A key that is both a prefix and a binding of its own waits; the sequence wins.
        return null;
      }
      return all.has(key) ? key : null;
    },
  };
}

/** Display parts for a combo: "g q" gives ["G", "Q"] (shown as "G then Q"), "?" gives ["?"]. */
export function comboParts(combo: string): string[] {
  return normalizeCombo(combo)
    .split(" ")
    .map((k) => {
      const map: Record<string, string> = { enter: "Enter", escape: "Esc", space: "Space", up: "Up", down: "Down", left: "Left", right: "Right", tab: "Tab" };
      return map[k] ?? (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
    });
}

/** Spoken form for screen readers and titles: "G then Q". */
export function comboLabel(combo: string): string {
  return comboParts(combo).join(" then ");
}

/** The workbench's default bindings, by action. Pass these as keys to useHotkeys. */
export const SHORTCUT_KEYS = {
  next: "j",
  previous: "k",
  open: "enter",
  acceptClose: "c",
  escalate: "e",
  override: "o",
  assignToMe: "a",
  focusNotes: "n",
  focusSearch: "/",
  goToQueue: "g q",
  help: "?",
} as const;

export interface ShortcutGroup {
  title: string;
  keys: { combo: string; label: string }[];
}

/** Groups for the ShortcutHelp overlay, matching SHORTCUT_KEYS. */
export const DEFAULT_SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Queue",
    keys: [
      { combo: SHORTCUT_KEYS.next, label: "Next alert" },
      { combo: SHORTCUT_KEYS.previous, label: "Previous alert" },
      { combo: SHORTCUT_KEYS.open, label: "Open the selected alert" },
      { combo: SHORTCUT_KEYS.focusSearch, label: "Search the queue" },
      { combo: SHORTCUT_KEYS.goToQueue, label: "Go to the queue" },
    ],
  },
  {
    title: "Alert",
    keys: [
      { combo: SHORTCUT_KEYS.acceptClose, label: "Accept the agent's close" },
      { combo: SHORTCUT_KEYS.escalate, label: "Escalate to L2" },
      { combo: SHORTCUT_KEYS.override, label: "Override (choose a reason code)" },
      { combo: SHORTCUT_KEYS.assignToMe, label: "Assign to me" },
      { combo: SHORTCUT_KEYS.focusNotes, label: "Write a note" },
    ],
  },
  {
    title: "Anywhere",
    keys: [
      { combo: SHORTCUT_KEYS.help, label: "Show these shortcuts" },
      { combo: "escape", label: "Close a dialog or menu" },
    ],
  },
];
