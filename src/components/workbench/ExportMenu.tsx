"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/viz/Icon";
import { useDismiss } from "./overlay";
import "./workbench.css";

export interface ExportMenuItem {
  label: string;
  hint?: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
}

export interface ExportMenuProps {
  items: ExportMenuItem[];
  /** Button text. Defaults to "Export". */
  label?: string;
}

/**
 * Menu button for exports. Enter, Space or Down opens it on the first item,
 * Up opens it on the last; arrows, Home and End move; Esc closes and returns
 * focus to the button; Tab closes. Async items show "Preparing" until done.
 */
export function ExportMenu({ items, label = "Export" }: ExportMenuProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useDismiss(menu, open, () => setOpen(false), btn);

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  useEffect(() => {
    if (open) itemRefs.current[focus]?.focus();
  }, [open, focus]);

  const openAt = (where: "first" | "last") => {
    if (!enabled.length) return;
    setFocus(where === "first" ? enabled[0] : enabled[enabled.length - 1]);
    setOpen(true);
  };
  const move = (dir: 1 | -1) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(focus);
    setFocus(enabled[(at + dir + enabled.length) % enabled.length]);
  };
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) btn.current?.focus();
  };

  const run = async (it: ExportMenuItem) => {
    if (it.disabled) return;
    close();
    setBusy(it.label);
    setStatus("");
    try {
      await it.onSelect();
      setStatus(`${it.label}: done.`);
    } catch (err) {
      setStatus(`${it.label} failed${err instanceof Error && err.message ? `: ${err.message}` : ""}. Try again.`);
    } finally {
      setBusy(null);
    }
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openAt("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt("last");
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      if (enabled.length) setFocus(enabled[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      if (enabled.length) setFocus(enabled[enabled.length - 1]);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: jump to the next item starting with that letter.
      const k = e.key.toLowerCase();
      const start = enabled.indexOf(focus);
      for (let s = 1; s <= enabled.length; s++) {
        const i = enabled[(start + s) % enabled.length];
        if (items[i].label.toLowerCase().startsWith(k)) {
          setFocus(i);
          break;
        }
      }
    }
  };

  return (
    <div className="wb-menu">
      <button
        ref={btn}
        type="button"
        className="btn btn-outline btn-small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${ids}-menu` : undefined}
        onClick={() => (open ? close(false) : openAt("first"))}
        onKeyDown={onButtonKey}
        aria-busy={busy ? true : undefined}
      >
        <Icon name="download" size={16} />
        {busy ? "Preparing" : label}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <ul ref={menu} id={`${ids}-menu`} className="wb-menu__list" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map((it, i) => (
            <li key={it.label} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={i === focus ? 0 : -1}
                aria-disabled={it.disabled || undefined}
                aria-describedby={it.hint ? `${ids}-h${i}` : undefined}
                className="wb-menu__item"
                onClick={() => void run(it)}
                onMouseEnter={() => !it.disabled && setFocus(i)}
              >
                <span>{it.label}</span>
                {it.hint && <small id={`${ids}-h${i}`}>{it.hint}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="visually-hidden" aria-live="polite">
        {busy ? `Preparing ${busy}.` : status}
      </span>
    </div>
  );
}
