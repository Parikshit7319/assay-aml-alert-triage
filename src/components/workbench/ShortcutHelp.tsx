"use client";

import { Fragment } from "react";
import { comboLabel, comboParts, DEFAULT_SHORTCUTS, type ShortcutGroup } from "./hotkeys";
import { Modal } from "./overlay";
import "./workbench.css";

export { DEFAULT_SHORTCUTS } from "./hotkeys";

export interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
  groups?: ShortcutGroup[];
}

/** Renders a combo as keycaps: "g q" becomes G then Q. */
export function Keys({ combo }: { combo: string }) {
  const parts = comboParts(combo);
  return (
    <span className="wb-keys">
      <span className="visually-hidden">{comboLabel(combo)}</span>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="wb-keys__then" aria-hidden="true">
              then
            </span>
          )}
          <kbd className="wb-kbd" aria-hidden="true">
            {p}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The "?" overlay listing keyboard shortcuts. A modal dialog: focus moves in,
 * Tab stays inside, Escape or the close button closes it, and focus returns
 * to whatever opened it.
 */
export function ShortcutHelp({ open, onClose, groups = DEFAULT_SHORTCUTS }: ShortcutHelpProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" description="Shortcuts work anywhere in the workbench except while you are typing in a field." className="wb-modal--wide">
      <div className="wb-shortcuts">
        {groups.map((g) => (
          <section key={g.title} className="wb-shortcuts__group" aria-label={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.keys.map((k) => (
                <div key={k.combo + k.label} className="wb-shortcuts__row">
                  <dt>{k.label}</dt>
                  <dd>
                    <Keys combo={k.combo} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
