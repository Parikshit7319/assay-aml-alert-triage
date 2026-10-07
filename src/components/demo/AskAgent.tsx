"use client";

import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askModel } from "@/lib/ask/model";
import { answerOffline, SUGGESTED_QUESTIONS, type AskAnswer, type AskContext } from "@/lib/ask/offline";
import { DEFAULT_ANTHROPIC_MODEL, type BrowserModelConfig } from "@/lib/engine/providers/browser";
import "./ask.css";

interface Props {
  ctx: AskContext;
  modelConfig: BrowserModelConfig | null;
  onCite?: (ids: string[]) => void;
  onConfigure?: () => void;
}

type Msg =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; answer: AskAnswer; via: string; error?: string };

/** A bracketed group of record ids, e.g. [TXN-8F3K2Q, KYC-4F2A9C]. */
const GROUP_RE = /\[([A-Z]{2,5}-[A-Z0-9]{3,16}(?:\s*,\s*[A-Z]{2,5}-[A-Z0-9]{3,16})*)\]/g;

const modelName = (cfg: BrowserModelConfig) => cfg.model.trim() || (cfg.provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : "model");

function Stamp({ id, onCite }: { id: string; onCite?: (ids: string[]) => void }) {
  return (
    <button type="button" className={`stamp ${id.startsWith("WL-") ? "stamp-red" : ""}`} onClick={() => onCite?.([id])} title={`Show record ${id}`}>
      <span>{id}</span>
    </button>
  );
}

function StampGroup({ ids, onCite }: { ids: string[]; onCite?: (ids: string[]) => void }) {
  if (ids.length <= 4) {
    return (
      <>
        {ids.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && " "}
            <Stamp id={id} onCite={onCite} />
          </Fragment>
        ))}
      </>
    );
  }
  return (
    <>
      <Stamp id={ids[0]} onCite={onCite} /> <Stamp id={ids[1]} onCite={onCite} />{" "}
      <button type="button" className="stamp stamp-muted" onClick={() => onCite?.(ids)} title="Highlight all cited records">
        <span>all {ids.length} records</span>
      </button>
    </>
  );
}

/** Replaces bracketed groups of cited ids with citation stamps. */
function inline(text: string, cited: Set<string>, onCite?: (ids: string[]) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(GROUP_RE)) {
    const ids = m[1].split(",").map((s) => s.trim()).filter((id) => cited.has(id));
    if (!ids.length) continue;
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at).replace(/\s+$/, " "));
    out.push(<StampGroup key={`g${at}`} ids={ids} onCite={onCite} />);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inlineIds(text: string, cited: Set<string>): Set<string> {
  const seen = new Set<string>();
  for (const m of text.matchAll(GROUP_RE)) for (const id of m[1].split(",").map((s) => s.trim())) if (cited.has(id)) seen.add(id);
  return seen;
}

function Answer({ m, onCite }: { m: Extract<Msg, { role: "agent" }>; onCite?: (ids: string[]) => void }) {
  const cited = new Set(m.answer.citations);
  const shown = inlineIds(m.answer.answer, cited);
  const extra = m.answer.citations.filter((id) => !shown.has(id));
  const lines = m.answer.answer.split("\n").filter((l) => l.trim());
  return (
    <div className="ask-msg ask-msg--agent">
      {m.error && <p className="form-error">{m.error}</p>}
      <div className="ask-answer">
        {lines.map((l, i) => {
          const bullet = /^\s*[-*]\s+/.test(l);
          return (
            <p key={i} className={`ask-line ${bullet ? "ask-line--bullet" : ""}`}>
              {inline(bullet ? l.replace(/^\s*[-*]\s+/, "") : l, cited, onCite)}
            </p>
          );
        })}
      </div>
      <div className="ask-meta">
        <span>Answered by {m.via}</span>
        {m.answer.citations.length > 0 && (
          <span className="ask-sources">
            {extra.length > 0 && <StampGroup ids={extra} onCite={onCite} />}
            {m.answer.citations.length > 1 && (
              <button type="button" className="stamp stamp-muted" onClick={() => onCite?.(m.answer.citations)} title="Highlight every record this answer cites">
                <span>highlight all {m.answer.citations.length}</span>
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function AskAgent({ ctx, modelConfig, onCite, onConfigure }: Props) {
  const alertId = ctx.bundle.alert.id;
  const inputId = useId();
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const nextId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const messages = threads[alertId] ?? [];
  const busy = pending !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);

  const push = (aid: string, m: Msg) => setThreads((t) => ({ ...t, [aid]: [...(t[aid] ?? []), m] }));

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    const aid = alertId;
    const askedCtx = ctx;
    const cfg = modelConfig;
    push(aid, { id: nextId.current++, role: "user", text: question });
    setInput("");

    if (!cfg) {
      push(aid, { id: nextId.current++, role: "agent", answer: answerOffline(question, askedCtx), via: "offline answerer (no model key)" });
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setPending(aid);
    try {
      const answer = await askModel(question, askedCtx, cfg, ac.signal);
      if (!mounted.current) return;
      push(aid, { id: nextId.current++, role: "agent", answer, via: `your model (${modelName(cfg)})` });
    } catch (err) {
      if (!mounted.current) return;
      push(aid, {
        id: nextId.current++,
        role: "agent",
        answer: answerOffline(question, askedCtx),
        via: "offline answerer (your model did not answer)",
        error: `${err instanceof Error ? err.message : String(err)} Showing the offline answer instead.`,
      });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      if (mounted.current) setPending((p) => (p === aid ? null : p));
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <section className="panel ask" aria-label="Ask about this alert">
      <div className="panel__head">
        <h2>Ask about this alert</h2>
        <span>{modelConfig ? `Your model: ${modelName(modelConfig)}` : "Offline answers"}</span>
      </div>
      <div className="panel__body ask-body">
        <p className="ask-intro">Answers use only this alert&apos;s records and cite the ids they rely on. Click an id to highlight the record.</p>

        <div className="ask-chips" role="group" aria-label="Suggested questions">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} type="button" className="ask-chip" onClick={() => void ask(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>

        <div className="ask-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Questions and answers">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ask-msg ask-msg--user">
                <p>
                  <span className="visually-hidden">You asked: </span>
                  {m.text}
                </p>
              </div>
            ) : (
              <Answer key={m.id} m={m} onCite={onCite} />
            ),
          )}
          {pending === alertId && <p className="ask-pending">Asking your model</p>}
        </div>

        <form className="ask-form" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            Your question
          </label>
          <input
            id={inputId}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the evidence, totals or next steps"
            maxLength={500}
            autoComplete="off"
          />
          <button className="btn btn-small" type="submit" disabled={busy || !input.trim()}>
            Ask
          </button>
          {busy && (
            <button className="btn btn-outline btn-small" type="button" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          )}
        </form>

        <div className="ask-foot">
          <button type="button" className="ask-link" onClick={onConfigure}>
            {modelConfig ? "Change model key" : "Use your own model key"}
          </button>
          <span>{modelConfig ? "Questions go from this browser straight to your provider." : "No key needed. Add one for open-ended answers."}</span>
        </div>
      </div>
    </section>
  );
}

export default AskAgent;
