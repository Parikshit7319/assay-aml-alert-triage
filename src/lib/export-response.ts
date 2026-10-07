import "server-only";
import { safeFilename } from "./exports/download";

const BOM = "﻿";

/** Content-Disposition with an ASCII-safe filename. */
export function disposition(kind: "attachment" | "inline", filename: string): string {
  const dot = filename.lastIndexOf(".");
  const safe = dot > 0 ? `${safeFilename(filename.slice(0, dot))}${filename.slice(dot)}` : safeFilename(filename);
  return `${kind}; filename="${safe}"`;
}

const base = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export function csvResponse(csv: string, filename: string): Response {
  // A byte order mark so Excel reads names with accents correctly.
  return new Response(BOM + csv, { headers: { ...base, "content-type": "text/csv; charset=utf-8", "content-disposition": disposition("attachment", filename) } });
}

export function jsonResponse(json: string, filename: string): Response {
  return new Response(json, { headers: { ...base, "content-type": "application/json; charset=utf-8", "content-disposition": disposition("attachment", filename) } });
}

export function htmlResponse(html: string, filename: string, download: boolean): Response {
  return new Response(html, {
    headers: { ...base, "content-type": "text/html; charset=utf-8", "content-disposition": disposition(download ? "attachment" : "inline", filename) },
  });
}

/**
 * Adds a print bar to a standalone print document (model risk pack, SAR draft).
 * Hidden when printing. Inline handlers keep the document self-contained.
 */
export function withPrintBar(html: string, opts: { downloadHref?: string; downloadLabel?: string; backHref?: string } = {}): string {
  const links = [
    opts.backHref ? `<a href="${opts.backHref}">Back to the workbench</a>` : "",
    opts.downloadHref ? `<a href="${opts.downloadHref}">${opts.downloadLabel ?? "Download"}</a>` : "",
  ].join("");
  const bar = `<div class="assay-printbar" role="region" aria-label="Print controls"><button type="button" onclick="window.print()">Print or save as PDF</button>${links}</div>`;
  const css = `<style>.assay-printbar{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;padding:10px 24px;background:#0c1a33;color:#fff;font:600 13px/1.4 system-ui,sans-serif}.assay-printbar button{font:inherit;padding:6px 12px;border:1px solid #fff;border-radius:4px;background:#fff;color:#0c1a33;cursor:pointer}.assay-printbar a{color:#fff}.assay-printbar :focus-visible{outline:2px solid #f5dc6b;outline-offset:2px}@media print{.assay-printbar{display:none}}</style>`;
  return html.replace("</head>", `${css}</head>`).replace(/<body([^>]*)>/, `<body$1>${bar}`);
}
