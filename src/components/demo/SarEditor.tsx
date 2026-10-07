"use client";

import { useId, useMemo, useRef, useState } from "react";
import { downloadBlob, downloadText, safeFilename } from "@/lib/exports/download";
import { buildSarDraft, formatUsd, SAR_NARRATIVE_LIMIT, sarToDocx, sarToPrintHtml, type SarDraftInput } from "@/lib/exports/sar";

interface Props {
  input: SarDraftInput;
  onNarrativeChange?: (text: string) => void;
}

type Status = { kind: "ok" | "error"; text: string } | null;

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy failed");
}

/**
 * Editable SAR draft: the narrative is editable, the mapped parts are shown
 * read-only, and the draft exports to Word or print. Nothing here files a SAR.
 *
 * The narrative resets when the alert or the incoming narrative changes.
 */
export function SarEditor({ input, onNarrativeChange }: Props) {
  const ids = useId();
  const [narrative, setNarrative] = useState(input.narrative);
  const [source, setSource] = useState(`${input.alertId}\u0000${input.narrative}`);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const clearTimer = useRef<number | undefined>(undefined);

  // Reset the editor when a different alert or a new generated narrative arrives.
  const nextSource = `${input.alertId}\u0000${input.narrative}`;
  if (nextSource !== source) {
    setSource(nextSource);
    setNarrative(input.narrative);
  }

  const draft = useMemo(() => buildSarDraft({ ...input, narrative }), [input, narrative]);
  const count = narrative.length;
  const over = count > SAR_NARRATIVE_LIMIT;
  const near = !over && count > SAR_NARRATIVE_LIMIT * 0.9;
  const stem = safeFilename(`sar-draft-${input.alertId}`);

  const flash = (s: Status) => {
    setStatus(s);
    window.clearTimeout(clearTimer.current);
    if (s?.kind === "ok") clearTimer.current = window.setTimeout(() => setStatus(null), 4000);
  };

  const onChange = (text: string) => {
    setNarrative(text);
    onNarrativeChange?.(text);
  };

  const downloadWord = async () => {
    setBusy(true);
    try {
      const blob = await sarToDocx(draft);
      downloadBlob(`${stem}.docx`, blob);
      flash({ kind: "ok", text: "Word draft downloaded. It has not been filed." });
    } catch {
      flash({ kind: "error", text: "Could not build the Word file. Try again, or use print instead." });
    } finally {
      setBusy(false);
    }
  };

  const printDraft = () => {
    const html = sarToPrintHtml(draft);
    const w = window.open("", "_blank");
    if (!w) {
      downloadText(`${stem}.html`, html, "text/html");
      flash({ kind: "ok", text: "Pop-ups are blocked, so the printable draft was downloaded as an HTML file instead." });
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    // Let layout and fonts settle before opening the print dialog.
    window.setTimeout(() => {
      try {
        w.print();
      } catch {
        /* the window was closed */
      }
    }, 300);
    flash({ kind: "ok", text: "Printable draft opened in a new window. Choose save as PDF to keep a copy." });
  };

  const copyNarrative = async () => {
    try {
      await copyText(narrative);
      flash({ kind: "ok", text: `Narrative copied (${count.toLocaleString("en-US")} characters).` });
    } catch {
      flash({ kind: "error", text: "Could not copy. Select the text and copy it manually." });
    }
  };

  const a = draft.activity;
  const subject = draft.subject;
  const categoryText = a.categories.map((c) => `${c.category}: ${c.subtype}`).join("; ");

  return (
    <section className="panel" aria-labelledby={`${ids}-title`}>
      <div className="panel__head">
        <h2 id={`${ids}-title`}>SAR draft</h2>
        <span>Draft only. Not filed.</span>
      </div>
      <div className="panel__body" style={{ display: "grid", gap: 16 }}>
        <dl className="kv" aria-label="Mapped SAR fields">
          <dt>Part I subject</dt>
          <dd>
            {subject.nameAsRecorded || "Missing"} ({subject.kind === "business" ? "entity" : "individual"}, {subject.country || "country missing"})
          </dd>
          <dt>Part II date range</dt>
          <dd className="num">{a.dateRange?.display ?? "No cited transactions"}</dd>
          <dt>Part II amount</dt>
          <dd className="num">
            {a.transactionCount ? `${formatUsd(a.totalAmountCents)} across ${a.transactionCount} cited transaction${a.transactionCount === 1 ? "" : "s"}` : "None cited"}
          </dd>
          <dt>Part II categories</dt>
          <dd>{categoryText}</dd>
          <dt>Part III locations</dt>
          <dd>{draft.institution.locations.length ? draft.institution.locations.join(", ") : "No branch recorded"}</dd>
        </dl>

        {draft.warnings.length > 0 && (
          <div className="note" role="note" aria-labelledby={`${ids}-warn`}>
            <strong id={`${ids}-warn`}>Check before filing ({draft.warnings.length})</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {draft.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="field" htmlFor={`${ids}-narrative`}>
          <span>Part V narrative</span>
          <textarea
            id={`${ids}-narrative`}
            value={narrative}
            onChange={(e) => onChange(e.target.value)}
            rows={14}
            spellCheck
            aria-describedby={`${ids}-count`}
            aria-invalid={over || undefined}
            style={{ fontFamily: "inherit", lineHeight: 1.55, borderColor: over ? "var(--red)" : undefined }}
          />
          <small id={`${ids}-count`} className="num" style={{ color: over ? "var(--red)" : near ? "var(--amber)" : undefined, fontWeight: over || near ? 650 : undefined }}>
            {count.toLocaleString("en-US")} of {SAR_NARRATIVE_LIMIT.toLocaleString("en-US")} characters
            {over ? `, ${(count - SAR_NARRATIVE_LIMIT).toLocaleString("en-US")} over the limit` : ""}
          </small>
        </label>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn btn-small" onClick={downloadWord} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Building Word file" : "Download Word (.docx)"}
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={printDraft}>
            Print or save as PDF
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={copyNarrative} disabled={!narrative}>
            Copy narrative
          </button>
        </div>

        <div aria-live="polite" role="status">
          {status && <p className={status.kind === "ok" ? "form-ok" : "form-error"}>{status.text}</p>}
        </div>

        <p style={{ fontSize: 13, color: "var(--pencil)" }}>{draft.disclaimer}</p>
      </div>
    </section>
  );
}
