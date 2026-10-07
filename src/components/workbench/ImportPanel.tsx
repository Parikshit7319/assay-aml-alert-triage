"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "@/components/viz/Icon";
import { csvToScenarios } from "@/lib/demo/csv-browser";
import type { Scenario } from "@/lib/demo/scenarios";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { downloadText } from "@/lib/exports/download";
import { REQUIRED_CSV_COLUMNS } from "@/lib/import-schema";
import { TYPOLOGY_LABEL } from "@/lib/labels";
import { buildTemplateCsv, checkImportFile, countByTypology, MAX_CSV_ALERTS, toErrorRows, type ImportErrorRow } from "./import-template";
import "./workbench.css";

export interface ImportPanelProps {
  onImport: (scenarios: Scenario[]) => void;
  onClose?: () => void;
}

type Parsed = { fileName: string; scenarios: Scenario[]; errors: ImportErrorRow[] };

/**
 * CSV import for the in-browser demo: drop or pick a file (up to 2 MB),
 * parse it with the product importer's rules, review row errors and a count
 * by alert type, then import. The file is read and parsed in the browser.
 */
export function ImportPanel({ onImport, onClose }: ImportPanelProps) {
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);

  const readFile = async (file: File) => {
    setParsed(null);
    const problem = checkImportFile(file);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    setReading(true);
    try {
      const text = await file.text();
      // Let the "Reading" status paint before a large parse.
      await new Promise((r) => setTimeout(r, 0));
      const { scenarios, errors } = csvToScenarios(text, new Date());
      setParsed({ fileName: file.name, scenarios, errors: toErrorRows(errors) });
    } catch {
      setFileError(`Could not read ${file.name}. Save it as UTF-8 CSV and try again.`);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    const files = e.dataTransfer.files;
    if (files.length > 1) {
      setFileError("Drop one file at a time.");
      return;
    }
    if (files[0]) void readFile(files[0]);
  };

  const n = parsed?.scenarios.length ?? 0;
  const byType = parsed ? countByTypology(parsed.scenarios) : [];
  const txns = byType.reduce((s, r) => s + r.transactions, 0);

  return (
    <section className="panel wb-import" aria-labelledby={`${ids}-h`}>
      <div className="panel__head">
        <h2 id={`${ids}-h`}>Import alerts from a CSV</h2>
        <span>runs in this browser</span>
      </div>
      <div className="panel__body wb-import__body">
        <p className="wb-import__privacy">
          <Icon name="shield" size={16} /> <span>The file never leaves your browser. It is parsed on this device with the same rules as the product importer; nothing is uploaded.</span>
        </p>

        <div
          className={`wb-drop ${drag ? "is-over" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
          }}
          onDrop={onDrop}
        >
          <Icon name="upload" size={22} />
          <p>
            <strong>Drop a CSV here</strong> or
          </p>
          <button type="button" className="btn btn-outline btn-small" onClick={() => inputRef.current?.click()} disabled={reading}>
            Choose a file
          </button>
          <input ref={inputRef} id={`${ids}-file`} className="visually-hidden" type="file" accept=".csv,text/csv" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
          <small>
            One row per transaction; rows with the same alert_id become one alert. Up to {MAX_CSV_ALERTS} alerts and 2 MB per file. Required columns: {REQUIRED_CSV_COLUMNS.join(", ")}.
          </small>
        </div>

        <div aria-live="polite" className="wb-import__status">
          {reading && <p className="wb-foot-note wb-foot-note--flush">Reading the file.</p>}
          {fileError && <p className="form-error">{fileError}</p>}
          {parsed && !reading && (
            <p className={n ? "form-ok" : "form-error"}>
              {parsed.fileName}: {n ? `${n} alert${n === 1 ? "" : "s"} ready, ${txns} transactions.` : "no alerts could be imported."}
              {parsed.errors.length ? ` ${parsed.errors.length} problem${parsed.errors.length === 1 ? "" : "s"} listed below.` : ""}
            </p>
          )}
        </div>

        {parsed && byType.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <caption className="wb-caption">Preview by alert type</caption>
              <thead>
                <tr>
                  <th>Alert type</th>
                  <th className="r">Alerts</th>
                  <th className="r">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((r) => (
                  <tr key={r.typology}>
                    <td>{TYPOLOGY_LABEL[r.typology]}</td>
                    <td className="r num">{r.alerts}</td>
                    <td className="r num">{r.transactions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {parsed && parsed.errors.length > 0 && (
          <div className="table-wrap wb-import__errors">
            <table className="table">
              <caption className="wb-caption">Skipped, with the reason</caption>
              <thead>
                <tr>
                  <th>Where</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {parsed.errors.map((e, i) => (
                  <tr key={i}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {e.where}
                    </td>
                    <td>{e.problem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="wb-import__actions">
          <button type="button" className="btn btn-small" disabled={!n || reading} onClick={() => parsed && onImport(parsed.scenarios)}>
            {n ? `Import ${n} alert${n === 1 ? "" : "s"}` : "Import alerts"}
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => downloadText("assay-alert-import-template.csv", buildTemplateCsv(), "text/csv")}>
            <Icon name="download" size={16} /> Download template
          </button>
          {onClose && (
            <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
        <p className="wb-foot-note wb-foot-note--flush">The template holds three synthetic rows for one alert. With fewer than {DEFAULT_POLICY.minTransactionsForDecision} transactions the agent abstains and hands the alert to an analyst, which is the policy working as designed.</p>
      </div>
    </section>
  );
}
