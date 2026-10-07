"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { initials } from "@/components/viz/helpers";
import { extractMentions, findMentionQuery, insertMention, matchMembers, splitMentions, type MentionMember, type MentionQuery } from "./mentions";
import { Time } from "./Time";
import "./workbench.css";

export type NoteKind = "note" | "handoff";

export interface ThreadNote {
  id: string;
  authorName: string;
  body: string;
  /** Member ids mentioned in the body. */
  mentions: string[];
  kind?: NoteKind;
  createdAt: string;
}

export interface NotesThreadProps {
  notes: ThreadNote[];
  members: (MentionMember & { role?: string })[];
  onAdd: (body: string, mentions: string[], kind: NoteKind) => void | Promise<void>;
  /** Shows the "Hand off to L2" switch. */
  canHandoff?: boolean;
  /** True while a note is being saved elsewhere; disables the composer. */
  pending?: boolean;
  /** Ref to the textarea, so a shortcut (N) can focus it. */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Heading text. Defaults to "Notes". */
  title?: string;
}

const MAX_NOTE = 2000;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as { current: T | null }).current = value;
}

function NoteBody({ body, members }: { body: string; members: MentionMember[] }) {
  const parts = splitMentions(body, members);
  return (
    <p className="wb-note__body">
      {parts.map((p, i) =>
        p.type === "mention" ? (
          <span key={i} className="wb-mention">
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

/**
 * Notes on an alert, with @mentions and an L2 handoff flag. Type @ to get a
 * list of teammates; arrow keys move, Enter or Tab inserts, Esc closes the
 * list. Ctrl or Cmd plus Enter posts the note.
 */
export function NotesThread({ notes, members, onAdd, canHandoff = false, pending = false, inputRef, title = "Notes" }: NotesThreadProps) {
  const ids = useId();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [handoff, setHandoff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => (query ? matchMembers(members, query.query, 6) : []), [members, query]);
  const listOpen = !!query && query.start !== dismissedAt && matches.length > 0;
  const activeIdx = Math.min(active, Math.max(0, matches.length - 1));
  const busy = pending || saving;

  const syncQuery = (value: string, caret: number) => {
    const q = findMentionQuery(value, caret);
    setQuery((cur) => {
      if (!q) return null;
      if (cur && cur.start === q.start && cur.query === q.query) return cur;
      return q;
    });
    if (!q || (query && q.start !== query.start)) setActive(0);
    if (q && dismissedAt != null && q.start !== dismissedAt) setDismissedAt(null);
  };

  const choose = (m: MentionMember) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? text.length;
    const next = insertMention(text, caret, m);
    setText(next.text.slice(0, MAX_NOTE));
    setQuery(null);
    setActive(0);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) {
      setError("Write something first.");
      taRef.current?.focus();
      return;
    }
    if (busy) return;
    setError(null);
    setSaving(true);
    try {
      await onAdd(body, extractMentions(body, members), canHandoff && handoff ? "handoff" : "note");
      setText("");
      setHandoff(false);
      setQuery(null);
    } catch {
      setError("The note was not saved. Your text is still here; try again.");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((activeIdx + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((activeIdx - 1 + matches.length) % matches.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) || e.key === "Tab") {
        e.preventDefault();
        choose(matches[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissedAt(query!.start);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const listId = `${ids}-members`;
  const optionId = (i: number) => `${ids}-opt-${i}`;
  const membersFor = (n: ThreadNote) => (n.mentions.length ? members.filter((m) => n.mentions.includes(m.id)) : members);

  return (
    <section className="wb-notes" aria-labelledby={`${ids}-h`}>
      <div className="wb-notes__head">
        <h3 id={`${ids}-h`}>{title}</h3>
        <span>{notes.length === 1 ? "1 note" : `${notes.length} notes`}</span>
      </div>

      {notes.length ? (
        <ol className="wb-notes__list">
          {notes.map((n) => (
            <li key={n.id} className={`wb-note ${n.kind === "handoff" ? "wb-note--handoff" : ""}`}>
              <div className="wb-note__meta">
                <span className="wb-avatar" aria-hidden="true">
                  {initials(n.authorName)}
                </span>
                <strong>{n.authorName}</strong>
                {n.kind === "handoff" && <span className="wb-note__kind">Handoff to L2</span>}
                <Time value={n.createdAt} format="relative" className="wb-note__time" />
              </div>
              <NoteBody body={n.body} members={membersFor(n)} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="wb-notes__empty">No notes on this alert yet. Notes go into the audit log with your name and the time.</p>
      )}

      <form className="wb-notes__form" onSubmit={submit} aria-busy={busy || undefined}>
        <label className="field" htmlFor={`${ids}-ta`}>
          <span>{canHandoff && handoff ? "Handoff note for the L2 investigator" : "Add a note"}</span>
        </label>
        <div className="wb-notes__compose">
          <textarea
            id={`${ids}-ta`}
            ref={(el) => {
              taRef.current = el;
              assignRef(inputRef, el);
            }}
            data-wb-notes-input=""
            rows={3}
            maxLength={MAX_NOTE}
            value={text}
            disabled={pending}
            placeholder="Type @ to mention a teammate"
            aria-autocomplete="list"
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen ? optionId(activeIdx) : undefined}
            aria-describedby={`${ids}-hint`}
            onChange={(e) => {
              setText(e.target.value);
              syncQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
              if (error) setError(null);
            }}
            onSelect={(e) => syncQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            onBlur={() => setQuery(null)}
          />
          {listOpen && (
            <ul id={listId} className="wb-mention-list" role="listbox" aria-label="Teammates">
              {matches.map((m, i) => (
                <li
                  key={m.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={i === activeIdx ? "is-active" : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(m)}
                >
                  <span className="wb-avatar" aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <span>
                    {m.name}
                    {m.role && <small>{m.role}</small>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p id={`${ids}-hint`} className="wb-notes__hint">
          Type @ to mention a teammate. Ctrl or Cmd plus Enter posts. {text.length > MAX_NOTE * 0.9 ? `${MAX_NOTE - text.length} characters left.` : ""}
        </p>
        <div className="visually-hidden" aria-live="polite">
          {listOpen ? `${matches.length} ${matches.length === 1 ? "teammate matches" : "teammates match"}. Up and down arrows choose, Enter inserts.` : ""}
        </div>
        <div aria-live="polite">{error && <p className="form-error">{error}</p>}</div>
        <div className="wb-notes__actions">
          {canHandoff && (
            <label className="wb-switch">
              <input type="checkbox" role="switch" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} aria-describedby={`${ids}-handoff`} />
              <span className="wb-switch__track" aria-hidden="true" />
              <span>Hand off to L2</span>
            </label>
          )}
          <button type="submit" className="btn btn-small" disabled={busy}>
            {busy ? "Saving" : canHandoff && handoff ? "Post handoff" : "Post note"}
          </button>
        </div>
        {canHandoff && (
          <p id={`${ids}-handoff`} className="wb-notes__hint">
            A handoff note is marked for the L2 investigator and stands out in the thread.
          </p>
        )}
      </form>
    </section>
  );
}
