/**
 * SAR draft builder. Maps an escalated alert's evidence onto the parts of the
 * FinCEN SAR as filed through BSA E-Filing, so an investigator starts from a
 * structured draft instead of a blank form.
 *
 * Pure TypeScript and browser safe. The Word export loads the `docx` package
 * on demand so it stays out of the main client bundle.
 *
 * Assay never files SARs. Everything here is a draft for human review.
 */
import { TYPOLOGY_LABEL } from "@/lib/labels";

/*
 * BSA E-Filing narrative field limit as commonly documented (17,000 characters).
 * Verify against current FinCEN specs before relying on it.
 */
export const SAR_NARRATIVE_LIMIT = 17_000;

export const SAR_DISCLAIMER =
  "Draft prepared for investigator review. Verify every field against FinCEN's current SAR instructions before filing. Assay never files SARs.";

const NOT_IN_BUNDLE = "Not in the evidence bundle. Add from core records.";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface SarDraftInput {
  alertId: string;
  ruleCode: string;
  ruleDescription: string;
  typology: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    kind: "individual" | "business";
    occupation: string | null;
    country: string;
    onboardedAt: string | null;
  };
  transactions: {
    id: string;
    ts: string;
    amountCents: number;
    direction: "in" | "out";
    channel: string;
    counterpartyName: string | null;
    counterpartyCountry: string | null;
    branch: string | null;
  }[];
  citedIds: string[];
  rationale: { claim: string; citations: string[] }[];
  narrative: string;
  institution: { name: string; contact: string };
}

export interface SarField {
  label: string;
  value: string;
  /** True when the value is a placeholder the investigator must complete. */
  missing?: boolean;
  note?: string;
}

export interface SarActivityCategory {
  category: string;
  subtype: string;
  note?: string;
}

export interface SarCitedTransaction {
  id: string;
  ts: string;
  date: string; // MM/DD/YYYY, UTC
  amountCents: number;
  direction: "in" | "out";
  channel: string;
  counterparty: string;
  counterpartyCountry: string | null;
  branch: string | null;
}

export type SarPartKey = "subject" | "activity" | "institution" | "filer" | "narrative";

export interface SarPart {
  key: SarPartKey;
  number: "I" | "II" | "III" | "IV" | "V";
  title: string;
  fields: SarField[];
}

export interface SarDraft {
  format: "assay.sar-draft.v1";
  status: "draft";
  alertId: string;
  ruleCode: string;
  ruleDescription: string;
  typology: string;
  typologyLabel: string;
  alertCreatedAt: string;
  preparedAt: string;
  disclaimer: string;
  warnings: string[];
  subject: {
    id: string;
    nameAsRecorded: string;
    kind: "individual" | "business";
    lastOrEntityName: string;
    firstName: string | null;
    occupation: string | null;
    country: string;
    onboardedAt: string | null;
  };
  activity: {
    dateRange: { start: string; end: string; display: string } | null;
    totalAmountCents: number;
    wholeDollars: number;
    inflowCents: number;
    outflowCents: number;
    transactionCount: number;
    channels: string[];
    categories: SarActivityCategory[];
    transactions: SarCitedTransaction[];
  };
  institution: { name: string; locations: string[] };
  filer: { name: string; contact: string };
  narrative: { text: string; characterCount: number; limit: number; overLimit: boolean; paragraphs: string[] };
  rationale: { claim: string; citations: string[] }[];
  /** Parts I to V in filing order, ready to render as label and value tables. */
  parts: SarPart[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CHANNEL_LABEL: Record<string, string> = { cash: "Cash", wire: "Wire", ach: "ACH", p2p: "P2P", card: "Card", check: "Check" };

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (cents: number) => usdFmt.format(cents / 100);

function toDate(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  const d = s instanceof Date ? s : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** MM/DD/YYYY in UTC, the date format BSA E-Filing uses. */
export function sarDate(s: string | Date | null | undefined): string {
  const d = toDate(s);
  if (!d) return "";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

function sarDateTime(s: string | Date | null | undefined): string {
  const d = toDate(s);
  if (!d) return "";
  return `${sarDate(d)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function splitName(name: string): { last: string; first: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { last: parts[0] ?? "", first: null };
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(" ") };
}

/** Suggested FinCEN SAR activity categories for an Assay typology. */
export function suggestCategories(typology: string): SarActivityCategory[] {
  switch (typology) {
    case "structuring":
      return [{ category: "Structuring", subtype: "Transaction(s) below CTR threshold" }];
    case "funnel_account":
      return [{ category: "Money laundering", subtype: "Funnel account" }];
    case "high_risk_wire":
      return [
        {
          category: "Other suspicious activities",
          subtype: "Other (describe in narrative)",
          note: "Wire activity involving a higher-risk jurisdiction. Pick a more specific subtype if the investigation supports one.",
        },
      ];
    case "sanctions_name":
      return [
        {
          category: "Other suspicious activities",
          subtype: "Other (describe in narrative)",
          note: "Sanctions matches are handled through OFAC processes. Flag for review before using a SAR for this activity.",
        },
      ];
    default:
      return [{ category: "Other suspicious activities", subtype: "Other (describe in narrative)" }];
  }
}

function narrativeParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function buildSarDraft(input: SarDraftInput, opts: { preparedAt?: string | Date } = {}): SarDraft {
  const warnings: string[] = [];
  const preparedAt = (toDate(opts.preparedAt ?? null) ?? new Date()).toISOString();

  /* Part I: subject */
  const c = input.customer;
  const name = (c.name ?? "").trim();
  const isEntity = c.kind === "business";
  const split = isEntity ? { last: name, first: null } : splitName(name);
  if (!name) warnings.push("Subject name is missing.");
  if (!c.occupation) warnings.push(isEntity ? "Subject type of business is missing." : "Subject occupation is missing.");
  if (!c.onboardedAt) warnings.push("Customer onboarding date is missing, so the relationship start date is blank.");
  if (!c.country) warnings.push("Subject country is missing.");
  warnings.push(
    isEntity
      ? "Subject address and TIN are not in the evidence bundle. Add them from core records."
      : "Subject address, date of birth, TIN and ID document are not in the evidence bundle. Add them from core records.",
  );

  const subjectFields: SarField[] = [
    { label: "Subject type", value: isEntity ? "Entity" : "Individual" },
    isEntity
      ? { label: "Legal name", value: name || "Missing", missing: !name }
      : { label: "Last name", value: split.last || "Missing", missing: !split.last },
  ];
  if (!isEntity) {
    subjectFields.push({ label: "First name", value: split.first ?? "Missing", missing: !split.first, note: "Split from the recorded name. Check middle names and suffixes." });
  }
  subjectFields.push(
    { label: "Name as recorded", value: name || "Missing", missing: !name },
    { label: isEntity ? "Type of business" : "Occupation", value: c.occupation ?? "Missing", missing: !c.occupation },
    { label: "Country", value: c.country || "Missing", missing: !c.country },
    { label: "Relationship to institution", value: "Customer" },
    { label: "Customer since", value: sarDate(c.onboardedAt) || "Missing", missing: !c.onboardedAt },
    { label: "Internal customer ID", value: c.id },
    { label: "Address", value: NOT_IN_BUNDLE, missing: true },
    { label: "TIN", value: NOT_IN_BUNDLE, missing: true },
  );
  if (!isEntity) {
    subjectFields.push({ label: "Date of birth", value: NOT_IN_BUNDLE, missing: true }, { label: "ID document", value: NOT_IN_BUNDLE, missing: true });
  }

  /* Part II: activity */
  const cited = new Set(input.citedIds);
  const txns = input.transactions
    .filter((t) => cited.has(t.id))
    .slice()
    .sort((a, b) => (toDate(a.ts)?.getTime() ?? 0) - (toDate(b.ts)?.getTime() ?? 0));
  const known = new Set(input.transactions.map((t) => t.id));
  const unknownTxnIds = input.citedIds.filter((id) => id.startsWith("TXN-") && !known.has(id));
  if (!txns.length) warnings.push("No cited transactions. The date range and amount involved cannot be computed.");
  if (unknownTxnIds.length) warnings.push(`${plural(unknownTxnIds.length, "cited transaction ID")} not found in the transaction list: ${unknownTxnIds.slice(0, 5).join(", ")}${unknownTxnIds.length > 5 ? " and more" : ""}.`);

  const totalAmountCents = txns.reduce((s, t) => s + Math.abs(t.amountCents), 0);
  const inflowCents = txns.filter((t) => t.direction === "in").reduce((s, t) => s + Math.abs(t.amountCents), 0);
  const outflowCents = totalAmountCents - inflowCents;
  // FinCEN forms take whole US dollars, rounded up. Verify against current FinCEN specs.
  const wholeDollars = Math.ceil(totalAmountCents / 100);
  const first = txns[0];
  const last = txns[txns.length - 1];
  const dateRange = first && last ? { start: sarDate(first.ts), end: sarDate(last.ts), display: first === last ? sarDate(first.ts) : `${sarDate(first.ts)} to ${sarDate(last.ts)}` } : null;
  const channels = [...new Set(txns.map((t) => CHANNEL_LABEL[t.channel] ?? t.channel))];
  const categories = suggestCategories(input.typology);
  if (input.typology === "sanctions_name") {
    warnings.push("This alert is a watchlist name match. Sanctions matches are handled through OFAC processes. Confirm with the sanctions team before drafting a SAR.");
  }

  const transactions: SarCitedTransaction[] = txns.map((t) => ({
    id: t.id,
    ts: t.ts,
    date: sarDate(t.ts),
    amountCents: t.amountCents,
    direction: t.direction,
    channel: CHANNEL_LABEL[t.channel] ?? t.channel,
    counterparty: t.counterpartyName ?? "",
    counterpartyCountry: t.counterpartyCountry,
    branch: t.branch,
  }));

  const activityFields: SarField[] = [
    { label: "Date or date range of suspicious activity", value: dateRange?.display ?? "No cited transactions", missing: !dateRange },
    {
      label: "Amount involved",
      value: txns.length ? formatUsd(totalAmountCents) : "No cited transactions",
      missing: !txns.length,
      note: txns.length
        ? `${plural(txns.length, "cited transaction")}: ${formatUsd(inflowCents)} in, ${formatUsd(outflowCents)} out. Enter $${wholeDollars.toLocaleString("en-US")} in whole dollars, rounded up.`
        : undefined,
    },
    ...categories.map((cat, i) => ({
      label: categories.length > 1 ? `Suggested category ${i + 1}` : "Suggested category",
      value: `${cat.category}: ${cat.subtype}`,
      note: cat.note,
    })),
    { label: "Payment channels in cited activity", value: channels.length ? channels.join(", ") : "None", note: "Use these to complete the instrument and product type items." },
    { label: "Alert rule", value: `${input.ruleCode}: ${input.ruleDescription}` },
  ];

  /* Part III: institution where activity occurred */
  const locations = [...new Set(txns.map((t) => (t.branch ?? "").trim()).filter(Boolean))].sort();
  if (txns.length && !locations.length) warnings.push("No branch is recorded on the cited transactions. Add the location where the activity occurred.");
  const instName = (input.institution.name ?? "").trim();
  const contact = (input.institution.contact ?? "").trim();
  if (!instName) warnings.push("Financial institution name is missing.");
  if (!contact) warnings.push("Filing institution contact is missing.");
  const institutionFields: SarField[] = [
    { label: "Financial institution name", value: instName || "Missing", missing: !instName },
    {
      label: locations.length > 1 ? "Branch locations" : "Branch location",
      value: locations.length ? locations.join("; ") : "Not recorded on cited transactions",
      missing: !locations.length,
      note: locations.length ? "Taken from the branch on each cited transaction. Add street addresses." : undefined,
    },
    { label: "Institution identifiers", value: "Add TIN, primary federal regulator and RSSD or other ID.", missing: true },
  ];

  /* Part IV: filing institution contact */
  const filerFields: SarField[] = [
    { label: "Filing institution", value: instName || "Missing", missing: !instName },
    { label: "Designated contact office", value: contact || "Missing", missing: !contact },
    { label: "Date filed", value: "Not filed. Assigned by BSA E-Filing at submission." },
    { label: "Prior report BSA ID", value: "Complete only for a continuing or corrected report." },
  ];

  /* Part V: narrative */
  const text = input.narrative ?? "";
  const characterCount = text.length;
  const overLimit = characterCount > SAR_NARRATIVE_LIMIT;
  if (!text.trim()) warnings.push("Narrative is empty.");
  if (overLimit) {
    warnings.push(`Narrative is ${characterCount.toLocaleString("en-US")} characters, ${(characterCount - SAR_NARRATIVE_LIMIT).toLocaleString("en-US")} over the ${SAR_NARRATIVE_LIMIT.toLocaleString("en-US")} character limit.`);
  }
  const narrativeFields: SarField[] = [
    { label: "Length", value: `${characterCount.toLocaleString("en-US")} of ${SAR_NARRATIVE_LIMIT.toLocaleString("en-US")} characters`, missing: overLimit || !text.trim() },
  ];

  const typologyLabel = (TYPOLOGY_LABEL as Record<string, string>)[input.typology] ?? input.typology;

  return {
    format: "assay.sar-draft.v1",
    status: "draft",
    alertId: input.alertId,
    ruleCode: input.ruleCode,
    ruleDescription: input.ruleDescription,
    typology: input.typology,
    typologyLabel,
    alertCreatedAt: input.createdAt,
    preparedAt,
    disclaimer: SAR_DISCLAIMER,
    warnings,
    subject: {
      id: c.id,
      nameAsRecorded: name,
      kind: c.kind,
      lastOrEntityName: split.last,
      firstName: split.first,
      occupation: c.occupation,
      country: c.country,
      onboardedAt: c.onboardedAt,
    },
    activity: {
      dateRange,
      totalAmountCents,
      wholeDollars,
      inflowCents,
      outflowCents,
      transactionCount: txns.length,
      channels,
      categories,
      transactions,
    },
    institution: { name: instName, locations },
    filer: { name: instName, contact },
    narrative: { text, characterCount, limit: SAR_NARRATIVE_LIMIT, overLimit, paragraphs: narrativeParagraphs(text) },
    rationale: input.rationale.map((r) => ({ claim: r.claim, citations: [...r.citations] })),
    parts: [
      { key: "subject", number: "I", title: "Subject information", fields: subjectFields },
      { key: "activity", number: "II", title: "Suspicious activity information", fields: activityFields },
      { key: "institution", number: "III", title: "Financial institution where activity occurred", fields: institutionFields },
      { key: "filer", number: "IV", title: "Filing institution contact information", fields: filerFields },
      { key: "narrative", number: "V", title: "Narrative", fields: narrativeFields },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Print-ready HTML                                                    */
/* ------------------------------------------------------------------ */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fieldRows(fields: SarField[]): string {
  return fields
    .map(
      (f) => `<tr${f.missing ? ' class="missing"' : ""}><th scope="row">${escapeHtml(f.label)}</th><td>${escapeHtml(f.value)}${
        f.note ? `<span class="field-note">${escapeHtml(f.note)}</span>` : ""
      }</td></tr>`,
    )
    .join("");
}

const PRINT_CSS = `
:root{--ink:#232a33;--ink-2:#47505b;--pencil:#656c74;--rule:#cdd6e1;--rule-strong:#a9b6c7;--blue:#34508f;--red:#b42318;--red-wash:#fae8e5;--amber:#7d5300;--amber-wash:#f8eccb;--sheet:#fbfcf9}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:var(--ink);font:400 10.5pt/1.5 "Public Sans","Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif}
.page{max-width:7.5in;margin:0 auto;padding:28px 24px 40px;position:relative}
h1,h2,h3{font-family:"Source Serif 4","Source Serif Pro",Georgia,"Times New Roman",serif;font-weight:600;color:var(--ink);margin:0;letter-spacing:-0.01em}
h1{font-size:22pt;line-height:1.15}
h2{font-size:13.5pt;margin:26px 0 8px;padding-bottom:5px;border-bottom:1.5px solid var(--ink);break-after:avoid;page-break-after:avoid}
h2 .part{font-family:inherit;color:var(--blue);margin-right:8px}
h3{font-size:11pt;margin:16px 0 6px;break-after:avoid;page-break-after:avoid}
p{margin:0 0 8px}
.masthead{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:10px;margin-bottom:18px;border-bottom:1px solid var(--rule-strong);font-size:9pt;color:var(--ink-2)}
.masthead b{font-weight:700;color:var(--ink);letter-spacing:.02em}
.stamp{display:inline-block;padding:3px 10px;border:1.5px solid var(--red);color:var(--red);font-weight:800;letter-spacing:.18em;font-size:9pt}
.meta{margin:8px 0 0;color:var(--ink-2);font-size:9.5pt}
.meta span{margin-right:14px;white-space:nowrap}
.disclaimer{margin:16px 0 0;padding:10px 12px;border-left:3px solid var(--red);background:var(--red-wash);font-size:9.5pt}
.warnings{margin:12px 0 0;padding:10px 12px;border-left:3px solid var(--amber);background:var(--amber-wash);font-size:9.5pt}
.warnings strong{display:block;margin-bottom:2px;color:var(--amber)}
.warnings ul{margin:0;padding-left:18px}
.warnings li{margin:2px 0}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
table.fields th{width:34%;text-align:left;vertical-align:top;font-weight:600;color:var(--ink-2);padding:6px 10px 6px 0;border-bottom:1px solid var(--rule)}
table.fields td{vertical-align:top;padding:6px 0;border-bottom:1px solid var(--rule)}
tr.missing td{color:var(--amber);font-style:italic}
.field-note{display:block;color:var(--pencil);font-size:8.5pt;font-style:normal}
table.grid th{text-align:left;font-weight:600;color:var(--ink-2);border-bottom:1.5px solid var(--ink-2);padding:5px 8px 5px 0;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em}
table.grid td{border-bottom:1px solid var(--rule);padding:5px 8px 5px 0;vertical-align:top}
table.grid td.num,table.grid th.num{text-align:right;font-variant-numeric:tabular-nums}
tr{break-inside:avoid;page-break-inside:avoid}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;font-size:8.5pt}
.narrative{margin-top:8px;padding:12px 14px;border:1px solid var(--rule-strong);background:var(--sheet);font-family:"Source Serif 4",Georgia,serif;font-size:10.5pt;line-height:1.6}
.narrative p{margin:0 0 10px;white-space:pre-wrap}
.narrative p:last-child{margin-bottom:0}
.empty{color:var(--pencil);font-style:italic}
ol.rationale{padding-left:18px;margin:6px 0 0;font-size:9.5pt}
ol.rationale li{margin:0 0 6px}
.cites{color:var(--pencil);font-size:8.5pt}
.footer{margin-top:30px;padding-top:10px;border-top:1px solid var(--rule-strong);font-size:8.5pt;color:var(--ink-2);display:flex;justify-content:space-between;gap:16px}
.watermark{position:fixed;top:42%;left:0;right:0;text-align:center;font:800 120pt/1 "Public Sans",system-ui,sans-serif;color:rgba(180,35,24,.06);transform:rotate(-28deg);pointer-events:none;z-index:0;letter-spacing:.08em}
.page>*{position:relative;z-index:1}
@page{size:letter;margin:0.6in 0.6in 0.7in}
@media print{.page{padding:0;max-width:none}a{color:inherit;text-decoration:none}}
`;

export function sarToPrintHtml(draft: SarDraft): string {
  const a = draft.activity;
  const part = (p: SarPart, extra = "") =>
    `<section><h2><span class="part">Part ${p.number}</span>${escapeHtml(p.title)}</h2><table class="fields"><tbody>${fieldRows(p.fields)}</tbody></table>${extra}</section>`;

  const categoriesTable = `<h3>Suggested activity categories</h3><table class="grid"><thead><tr><th>Category</th><th>Subtype</th><th>Note</th></tr></thead><tbody>${a.categories
    .map((c) => `<tr><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.subtype)}</td><td>${escapeHtml(c.note ?? "")}</td></tr>`)
    .join("")}</tbody></table>`;

  const txnTable = a.transactions.length
    ? `<h3>Cited transactions (${a.transactions.length})</h3><table class="grid"><thead><tr><th>Record</th><th>Date</th><th>Direction</th><th>Channel</th><th>Counterparty</th><th>Branch</th><th class="num">Amount</th></tr></thead><tbody>${a.transactions
        .map(
          (t) =>
            `<tr><td class="mono">${escapeHtml(t.id)}</td><td>${escapeHtml(t.date)}</td><td>${t.direction === "in" ? "In" : "Out"}</td><td>${escapeHtml(t.channel)}</td><td>${escapeHtml(
              t.counterparty ? `${t.counterparty}${t.counterpartyCountry ? ` (${t.counterpartyCountry})` : ""}` : "",
            )}</td><td>${escapeHtml(t.branch ?? "")}</td><td class="num">${escapeHtml(formatUsd(t.amountCents))}</td></tr>`,
        )
        .join("")}<tr><td colspan="6"><b>Total</b></td><td class="num"><b>${escapeHtml(formatUsd(a.totalAmountCents))}</b></td></tr></tbody></table>`
    : `<p class="empty">No transactions are cited in this draft.</p>`;

  const narrativeBlock = draft.narrative.paragraphs.length
    ? `<div class="narrative">${draft.narrative.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</div>`
    : `<div class="narrative"><p class="empty">Narrative not written yet.</p></div>`;

  const rationale = draft.rationale.length
    ? `<section><h2>Supporting rationale from triage</h2><p class="cites">Each claim was checked against the cited records before the alert was escalated. Use it as working notes, not as filing text.</p><ol class="rationale">${draft.rationale
        .map((r) => `<li>${escapeHtml(r.claim)}${r.citations.length ? ` <span class="cites">[${escapeHtml(r.citations.join(", "))}]</span>` : ""}</li>`)
        .join("")}</ol></section>`
    : "";

  const [subject, activity, institution, filer, narrative] = draft.parts;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SAR draft ${escapeHtml(draft.alertId)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="watermark" aria-hidden="true">DRAFT</div>
<main class="page">
<header class="masthead"><span><b>ASSAY</b> &nbsp;SAR draft for alert <span class="mono">${escapeHtml(draft.alertId)}</span></span><span class="stamp">DRAFT</span></header>
<h1>Suspicious activity report draft</h1>
<p class="meta"><span>Alert ${escapeHtml(draft.alertId)}</span><span>Rule ${escapeHtml(draft.ruleCode)}</span><span>${escapeHtml(draft.typologyLabel)}</span><span>Alert created ${escapeHtml(sarDate(draft.alertCreatedAt))}</span><span>Prepared ${escapeHtml(sarDateTime(draft.preparedAt))}</span></p>
<p class="disclaimer"><b>Not filed.</b> ${escapeHtml(draft.disclaimer)}</p>
${
  draft.warnings.length
    ? `<div class="warnings"><strong>Check before filing (${draft.warnings.length})</strong><ul>${draft.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`
    : ""
}
${part(subject)}
${part(activity, categoriesTable + txnTable)}
${part(institution)}
${part(filer)}
${part(narrative, narrativeBlock)}
${rationale}
<footer class="footer"><span>${escapeHtml(draft.disclaimer)}</span><span class="mono">${escapeHtml(draft.alertId)}</span></footer>
</main>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Word (.docx)                                                        */
/* ------------------------------------------------------------------ */

export async function sarToDocx(draft: SarDraft): Promise<Blob> {
  const d = await import("docx");
  const { TextWatermark } = await import("docx/watermarks");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType, PageNumber } = d;

  const INK = "232A33";
  const INK2 = "47505B";
  const PENCIL = "656C74";
  const RULE = "CDD6E1";
  const RED = "B42318";
  const AMBER = "7D5300";
  const LABEL_FILL = "F1F4EF";
  const CONTENT_WIDTH = 9360; // Letter, 1 inch margins, in twips

  const hairline = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const tableBorders = { top: hairline, bottom: hairline, left: none, right: none, insideHorizontal: hairline, insideVertical: none };
  const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

  const text = (s: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number; font?: string } = {}) => new TextRun({ text: s, ...o });

  const fieldTable = (fields: SarField[]) =>
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [3100, CONTENT_WIDTH - 3100],
      borders: tableBorders,
      rows: fields.map(
        (f) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: 3100, type: WidthType.DXA },
                shading: { fill: LABEL_FILL, type: ShadingType.CLEAR, color: "auto" },
                margins: cellMargins,
                children: [new Paragraph({ children: [text(f.label, { bold: true, color: INK2, size: 19 })] })],
              }),
              new TableCell({
                width: { size: CONTENT_WIDTH - 3100, type: WidthType.DXA },
                margins: cellMargins,
                children: [
                  new Paragraph({ children: [text(f.value, f.missing ? { italics: true, color: AMBER, size: 20 } : { size: 20 })] }),
                  ...(f.note ? [new Paragraph({ children: [text(f.note, { color: PENCIL, size: 17 })] })] : []),
                ],
              }),
            ],
          }),
      ),
    });

  const gridTable = (head: string[], rows: string[][], widths: number[], rightAlign: number[] = [], boldLastRow = false) =>
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      borders: tableBorders,
      rows: [
        new TableRow({
          tableHeader: true,
          children: head.map(
            (h, i) =>
              new TableCell({
                width: { size: widths[i], type: WidthType.DXA },
                shading: { fill: LABEL_FILL, type: ShadingType.CLEAR, color: "auto" },
                margins: cellMargins,
                children: [new Paragraph({ alignment: rightAlign.includes(i) ? AlignmentType.END : AlignmentType.START, children: [text(h, { bold: true, color: INK2, size: 17 })] })],
              }),
          ),
        }),
        ...rows.map(
          (r, ri) =>
            new TableRow({
              cantSplit: true,
              children: r.map(
                (v, i) =>
                  new TableCell({
                    width: { size: widths[i], type: WidthType.DXA },
                    margins: cellMargins,
                    children: [
                      new Paragraph({
                        alignment: rightAlign.includes(i) ? AlignmentType.END : AlignmentType.START,
                        children: [text(v, { size: 18, bold: boldLastRow && ri === rows.length - 1 })],
                      }),
                    ],
                  }),
              ),
            }),
        ),
      ],
    });

  const h1 = (p: SarPart) =>
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text(`Part ${p.number}  `, { color: "34508F" }), text(p.title)] });
  const h2 = (s: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text(s)] });
  const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

  const a = draft.activity;
  const [subject, activity, institution, filer, narrative] = draft.parts;

  const body = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [text("Suspicious activity report draft")] }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        text(`Alert ${draft.alertId}   Rule ${draft.ruleCode}   ${draft.typologyLabel}   Alert created ${sarDate(draft.alertCreatedAt)}   Prepared ${sarDateTime(draft.preparedAt)}`, {
          color: INK2,
          size: 18,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 8 } },
      shading: { fill: "FAE8E5", type: ShadingType.CLEAR, color: "auto" },
      children: [text("Not filed. ", { bold: true, color: RED, size: 19 }), text(draft.disclaimer, { size: 19 })],
    }),
    ...(draft.warnings.length
      ? [
          new Paragraph({ spacing: { before: 60, after: 60 }, children: [text(`Check before filing (${draft.warnings.length})`, { bold: true, color: AMBER, size: 20 })] }),
          ...draft.warnings.map((w) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [text(w, { size: 19 })] })),
        ]
      : []),

    h1(subject),
    fieldTable(subject.fields),

    h1(activity),
    fieldTable(activity.fields),
    h2("Suggested activity categories"),
    gridTable(
      ["Category", "Subtype", "Note"],
      a.categories.map((c) => [c.category, c.subtype, c.note ?? ""]),
      [2700, 2900, CONTENT_WIDTH - 5600],
    ),
    h2(`Cited transactions (${a.transactions.length})`),
    a.transactions.length
      ? gridTable(
          ["Record", "Date", "Dir.", "Channel", "Counterparty", "Branch", "Amount"],
          [
            ...a.transactions.map((t) => [
              t.id,
              t.date,
              t.direction === "in" ? "In" : "Out",
              t.channel,
              t.counterparty ? `${t.counterparty}${t.counterpartyCountry ? ` (${t.counterpartyCountry})` : ""}` : "",
              t.branch ?? "",
              formatUsd(t.amountCents),
            ]),
            ["Total", "", "", "", "", "", formatUsd(a.totalAmountCents)],
          ],
          [1400, 1100, 600, 900, 2200, 1660, 1500],
          [6],
          true,
        )
      : new Paragraph({ children: [text("No transactions are cited in this draft.", { italics: true, color: PENCIL })] }),

    h1(institution),
    fieldTable(institution.fields),

    h1(filer),
    fieldTable(filer.fields),

    h1(narrative),
    fieldTable(narrative.fields),
    spacer(),
    ...(draft.narrative.paragraphs.length
      ? draft.narrative.paragraphs.map(
          (p) =>
            new Paragraph({
              spacing: { after: 160, line: 300 },
              children: p.split("\n").map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : undefined, font: "Georgia", size: 21 })),
            }),
        )
      : [new Paragraph({ children: [text("Narrative not written yet.", { italics: true, color: PENCIL })] })]),

    ...(draft.rationale.length
      ? [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text("Supporting rationale from triage")] }),
          new Paragraph({
            spacing: { after: 80 },
            children: [text("Each claim was checked against the cited records before the alert was escalated. Use it as working notes, not as filing text.", { color: PENCIL, size: 18 })],
          }),
          ...draft.rationale.map(
            (r) =>
              new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 60 },
                children: [text(r.claim, { size: 19 }), ...(r.citations.length ? [text(`  [${r.citations.join(", ")}]`, { color: PENCIL, size: 16 })] : [])],
              }),
          ),
        ]
      : []),

    new Paragraph({
      spacing: { before: 360 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
      children: [text(draft.disclaimer, { italics: true, color: INK2, size: 18 })],
    }),
  ];

  const doc = new Document({
    title: `SAR draft ${draft.alertId}`,
    subject: "Suspicious activity report draft",
    description: draft.disclaimer,
    creator: "Assay",
    keywords: "SAR, draft, not filed",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21, color: INK } },
        title: { run: { font: "Georgia", size: 40, bold: false, color: INK }, paragraph: { spacing: { after: 80 } } },
        heading1: { run: { font: "Georgia", size: 28, bold: true, color: INK }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
        heading2: { run: { font: "Georgia", size: 22, bold: true, color: INK2 }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.END,
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
                children: [
                  text("DRAFT", { bold: true, color: RED, size: 18, font: "Calibri" }),
                  text(`   Not filed   |   SAR draft for alert ${draft.alertId}`, { color: INK2, size: 16 }),
                  new TextWatermark({ text: "DRAFT", color: "D9D9D9", opacity: 0.35, font: "Calibri" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.START,
                children: [text("Draft for investigator review. Assay never files SARs.", { color: PENCIL, size: 15 })],
              }),
              new Paragraph({
                alignment: AlignmentType.END,
                children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], color: PENCIL, size: 15 })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });

  return Packer.toBlob(doc);
}
