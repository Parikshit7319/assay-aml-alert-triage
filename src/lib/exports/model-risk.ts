/**
 * Model risk documentation pack for the triage agent. Returns a standalone,
 * print-ready HTML document built from live policy, run and QA statistics.
 * Pure TypeScript with no browser or Node dependencies.
 */
import { AUTONOMY_LEVELS, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { TYPOLOGY_LABEL } from "@/lib/labels";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { escapeHtml } from "./sar";

export interface ModelRiskPackInput {
  workspaceName: string;
  generatedAt: string;
  policy: {
    version: number;
    autonomy: Record<string, number>;
    closeConfidenceFloor: number;
    autoCloseConfidenceFloor: number;
    watchlistForceL2Similarity: number;
    minTransactionsForDecision: number;
    qaSampleRate: number;
    provider: string;
  };
  /** promptVersion: hash of the system prompt template (PROMPT_VERSION in src/lib/engine/prompt.ts). Optional for older callers. */
  model: { provider: string; model: string; promptVersion?: string };
  runStats: {
    runs: number;
    completed: number;
    locked: number;
    abstained: number;
    citationValidRate: number | null;
    avgCostUsd: number;
  };
  typologyStats: {
    typology: string;
    alerts: number;
    qaSampled: number;
    qaAgreement: number | null;
    shadowAgreement: number | null;
  }[];
}

/** Section headings, in order. Exported so tests and tables of contents stay in sync. */
export const MODEL_RISK_SECTIONS = [
  "Purpose and scope",
  "Regulatory context",
  "Inputs and data lineage",
  "Method",
  "Controls",
  "Performance and monitoring",
  "Limitations and known risks",
  "Change management",
  "Sign-off",
] as const;

const e = escapeHtml;
const n = (x: number) => x.toLocaleString("en-US");
const pct = (x: number | null, digits = 1) => (x === null || !Number.isFinite(x) ? "Not enough data" : `${(x * 100).toFixed(digits).replace(/\.0+$/, "")}%`);
const share = (part: number, whole: number) => (whole > 0 ? pct(part / whole) : "Not enough data");
const usd = (x: number) => x.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const typologyName = (t: string) => (TYPOLOGY_LABEL as Record<string, string>)[t] ?? t;
const levelName = (lvl: number) => AUTONOMY_LEVELS.find((l) => l.level === lvl)?.name ?? `Level ${lvl}`;

function when(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return (
    d.toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC"
  );
}

const CSS = `
:root{--ink:#232a33;--ink-2:#47505b;--pencil:#656c74;--rule:#cdd6e1;--rule-strong:#a9b6c7;--blue:#34508f;--blue-wash:#e2e8f3;--red:#b42318;--green:#2f6b4f;--amber:#7d5300;--amber-wash:#f8eccb;--sheet:#fbfcf9}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:var(--ink);font:400 10.5pt/1.55 "Public Sans","Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif}
.page{max-width:7.5in;margin:0 auto;padding:32px 24px 48px}
h1,h2,h3{font-family:"Source Serif 4","Source Serif Pro",Georgia,"Times New Roman",serif;font-weight:600;margin:0;letter-spacing:-0.01em;color:var(--ink)}
h1{font-size:24pt;line-height:1.12}
h2{font-size:14pt;margin:30px 0 10px;padding-bottom:5px;border-bottom:1.5px solid var(--ink);break-after:avoid;page-break-after:avoid}
h2 .no{color:var(--blue);margin-right:10px;font-variant-numeric:tabular-nums}
h3{font-size:11pt;margin:18px 0 6px;break-after:avoid;page-break-after:avoid}
p{margin:0 0 9px}
ul,ol{margin:0 0 10px;padding-left:20px}
li{margin:0 0 4px}
.masthead{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:10px;margin-bottom:22px;border-bottom:1px solid var(--rule-strong);font-size:9pt;color:var(--ink-2)}
.masthead b{color:var(--ink);letter-spacing:.04em}
.lede{font-size:11.5pt;color:var(--ink-2);margin-top:8px}
.meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:18px 0 0;padding:12px 14px;background:var(--sheet);border:1px solid var(--rule);font-size:9.5pt}
.meta dt{color:var(--pencil)}
.meta dd{margin:0;font-weight:600}
.toc{margin:18px 0 0;padding:0;list-style:none;columns:2;column-gap:28px;font-size:9.5pt}
.toc li{margin:0 0 3px;break-inside:avoid}
.toc span{display:inline-block;width:22px;color:var(--blue);font-variant-numeric:tabular-nums}
.callout{margin:10px 0 12px;padding:10px 12px;border-left:3px solid var(--blue);background:var(--blue-wash);font-size:9.5pt}
.callout.warn{border-left-color:var(--amber);background:var(--amber-wash)}
table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:4px 0 12px}
th{text-align:left;font-weight:600;color:var(--ink-2);border-bottom:1.5px solid var(--ink-2);padding:6px 10px 6px 0;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em;vertical-align:bottom}
td{border-bottom:1px solid var(--rule);padding:6px 10px 6px 0;vertical-align:top}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr{break-inside:avoid;page-break-inside:avoid}
.steps{counter-reset:s;list-style:none;padding:0}
.steps li{counter-increment:s;position:relative;padding-left:30px;margin-bottom:8px}
.steps li::before{content:counter(s);position:absolute;left:0;top:1px;width:20px;height:20px;border:1.5px solid var(--blue);color:var(--blue);font-size:8.5pt;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:50%}
.never li{list-style:none;position:relative;padding-left:4px}
.never li::before{content:"";position:absolute;left:-16px;top:.55em;width:8px;height:8px;background:var(--red)}
.sign td{height:44px;vertical-align:bottom}
.sign td.line{border-bottom:1px solid var(--ink)}
.muted{color:var(--pencil)}
.footer{margin-top:34px;padding-top:10px;border-top:1px solid var(--rule-strong);font-size:8.5pt;color:var(--ink-2);display:flex;justify-content:space-between;gap:16px}
@page{size:letter;margin:0.6in 0.6in 0.7in}
@media print{.page{padding:0;max-width:none}h2{break-before:auto}}
`;

export function buildModelRiskPack(input: ModelRiskPackInput): string {
  const { policy, model, runStats: r, typologyStats } = input;
  const h2 = (i: number) => `<h2 id="s${i + 1}"><span class="no">${i + 1}</span>${e(MODEL_RISK_SECTIONS[i])}</h2>`;

  const autonomyRows = Object.entries(policy.autonomy)
    .sort(([a], [b]) => typologyName(a).localeCompare(typologyName(b)))
    .map(([t, lvl]) => {
      const level = AUTONOMY_LEVELS.find((l) => l.level === lvl);
      return `<tr><td>${e(typologyName(t))}</td><td class="num">L${e(String(lvl))}</td><td>${e(levelName(lvl))}</td><td>${e(level?.detail ?? "")}</td></tr>`;
    })
    .join("");

  const thresholdRows: [string, string, string][] = [
    ["Close confidence floor", pct(policy.closeConfidenceFloor), "A model recommendation to close below this confidence becomes human review (rule P5)."],
    ["Auto-close confidence floor", pct(policy.autoCloseConfidenceFloor), "Only applies to alert types at L3. Below this, the alert goes to an analyst."],
    ["Watchlist similarity that forces L2", policy.watchlistForceL2Similarity.toFixed(2), "Any name match at or above this similarity goes to L2 review and the agent cannot close it (rule P2)."],
    ["Minimum transactions for a decision", n(policy.minTransactionsForDecision), "With fewer transactions in the lookback window, the agent abstains (rule P3)."],
    ["QA sample rate", pct(policy.qaSampleRate), "Share of agent-assisted closes drawn for independent QA review."],
    ["Model provider setting", policy.provider, "Provider configured in the policy. Changing it creates a new policy version."],
  ];

  const typologyRows = typologyStats.length
    ? typologyStats
        .map(
          (t) =>
            `<tr><td>${e(typologyName(t.typology))}</td><td class="num">${n(t.alerts)}</td><td class="num">${n(t.qaSampled)}</td><td class="num">${e(pct(t.qaAgreement))}</td><td class="num">${e(
              pct(t.shadowAgreement),
            )}</td><td class="num">L${e(String(policy.autonomy[t.typology] ?? "?"))}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="muted">No alerts in the reporting period.</td></tr>`;

  const totals = typologyStats.reduce((s, t) => ({ alerts: s.alerts + t.alerts, qa: s.qa + t.qaSampled }), { alerts: 0, qa: 0 });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Model risk documentation pack, ${e(input.workspaceName)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="page">
<header class="masthead"><span><b>ASSAY</b> &nbsp;Triage agent</span><span>For internal review</span></header>
<h1>Model risk documentation pack</h1>
<p class="lede">How the alert triage agent works, what it may and may not do, and how its performance is monitored. Prepared for model owners, BSA officers and model risk reviewers.</p>
<dl class="meta">
<dt>Workspace</dt><dd>${e(input.workspaceName)}</dd>
<dt>Generated</dt><dd>${e(when(input.generatedAt))}</dd>
<dt>Policy version</dt><dd>v${e(String(policy.version))}</dd>
<dt>Model</dt><dd>${e(model.model)} (${e(model.provider)})</dd>
${model.promptVersion ? `<dt>Prompt version</dt><dd>${e(model.promptVersion)}</dd>\n` : ""}<dt>Status</dt><dd>Draft for review. Not independently validated.</dd>
</dl>
<ol class="toc">${MODEL_RISK_SECTIONS.map((s, i) => `<li><span>${i + 1}</span>${e(s)}</li>`).join("")}</ol>

<section>
${h2(0)}
<p>The triage agent performs first-pass review of transaction-monitoring alerts. For each alert it gathers the evidence, runs deterministic typology checks, asks a language model for an assessment, and returns a recommendation (close, escalate, or needs review) with a rationale in which every claim cites a source record.</p>
<p>Humans decide. Analysts accept or override every recommendation unless an alert type has been promoted to a higher autonomy level under the controls in section 5. The agent does not decide whether to file a SAR, does not clear watchlist matches, and does not contact customers.</p>
<p><b>In scope:</b> alert triage recommendations, rationale and draft narratives for escalated alerts. <b>Out of scope:</b> alert generation (the institution's monitoring system), SAR filing decisions, sanctions screening dispositions and customer risk rating.</p>
</section>

<section>
${h2(1)}
<p>On April 17, 2026 the federal banking agencies issued interagency model risk management guidance (Federal Reserve SR 26-2, OCC Bulletin 2026-13). The guidance states that generative and agentic AI models are not within its scope, and that a bank's own risk management practices should govern them.</p>
<p>This pack therefore documents the triage agent's controls under the institution's own model risk and third-party risk framework. It is not a claim of compliance with any specific supervisory guidance. BSA/AML program requirements, including SAR timing and content rules, continue to apply to the humans who make filing decisions.</p>
<p class="callout">Reviewers should confirm how the institution's framework classifies this tool (model, AI system, or end-user tool) and record that classification in the sign-off in section 9.</p>
</section>

<section>
${h2(2)}
<p>The agent sees one evidence bundle per alert, assembled in code from the institution's records. The model has no tools to fetch other data, browse the web or write to any system.</p>
<table>
<thead><tr><th>Input</th><th>Contents</th><th>Citation prefix</th></tr></thead>
<tbody>
<tr><td>Alert</td><td>Rule code and description, typology, triggering transaction IDs, creation time.</td><td>ALT-</td></tr>
<tr><td>KYC profile</td><td>Customer type, occupation or industry, country, onboarding date, risk rating, expected monthly volume, KYC notes.</td><td>KYC-</td></tr>
<tr><td>Transactions</td><td>All transactions in the 90 days before the alert, plus up to 3 years of older history used for seasonality and established relationships.</td><td>TXN-</td></tr>
<tr><td>Prior cases</td><td>Earlier alerts and SARs on the same customer, with outcomes.</td><td>CASE-</td></tr>
<tr><td>Watchlist</td><td>Institution-supplied watchlist entries used for name similarity screening.</td><td>WL-</td></tr>
</tbody>
</table>
<p><b>Lineage.</b> Every record keeps the ID it has in the source system, and every claim in the rationale must cite one or more of these IDs. Customer-supplied text (memos and counterparty names) is treated as untrusted data: it is scanned for instruction-like content before any model call and is never treated as an instruction.</p>
</section>

<section>
${h2(3)}
<ol class="steps">
<li><b>Deterministic typology checks.</b> Code computes the facts first: structuring counts and amounts, funnel pass-through ratios, high-risk wire destinations, payroll cadence, seasonal baselines, watchlist similarity and data completeness. No model is involved.</li>
<li><b>Pre-model policy.</b> Rules can stop the run before the model is called: instruction-like text locks the alert to a human (P1), a strong watchlist match forces L2 review (P2), and too little data makes the agent abstain (P3).</li>
<li><b>Model assessment.</b> The model receives the evidence bundle and the computed findings and returns a recommendation, confidence, risk score, cited rationale and, for escalations, a draft narrative.</li>
<li><b>Claim-to-record validation.</b> Each claim is checked against the bundle. Unknown citations, uncited claims and dollar figures that do not match the cited records are flagged.</li>
<li><b>Post-model policy.</b> Failed validation downgrades the recommendation to human review (P4), a close below the confidence floor becomes human review (P5), and an unverified dollar figure blocks auto-close (P6).</li>
</ol>
<p>Every step is written to a trace stored with the run, together with the model name, provider, policy version, token counts and cost.</p>
</section>

<section>
${h2(4)}
<h3>Current thresholds (policy v${e(String(policy.version))})</h3>
<table>
<thead><tr><th>Control</th><th class="num">Value</th><th>Effect</th></tr></thead>
<tbody>${thresholdRows.map(([a, b, c]) => `<tr><td>${e(a)}</td><td class="num">${e(b)}</td><td>${e(c)}</td></tr>`).join("")}</tbody>
</table>
<h3>Autonomy level by alert type</h3>
<table>
<thead><tr><th>Alert type</th><th class="num">Level</th><th>Name</th><th>What the agent may do</th></tr></thead>
<tbody>${autonomyRows}</tbody>
</table>
<h3>Never automated, at any level</h3>
<ul class="never">${NEVER_AUTOMATED.map((x) => `<li>${e(x)}</li>`).join("")}</ul>
<h3>Other controls</h3>
<ul>
<li>Shadow mode (L0) hides the recommendation until the analyst decides, so agreement can be measured without anchoring.</li>
<li>Overrides require a reason code, and every decision records whether the human agreed with the agent.</li>
<li>Agent-assisted closes are sampled for QA at the rate above. Promotion to L3 requires ${e(pct(L3_MIN_AGREEMENT))} QA agreement on at least ${n(L3_MIN_QA)} reviewed alerts of that type and written sign-off.</li>
<li>The SAR deadline clock starts at the L2 suspicion determination, never at alert creation.</li>
</ul>
</section>

<section>
${h2(5)}
<h3>Run outcomes</h3>
<table>
<thead><tr><th>Measure</th><th class="num">Value</th><th class="num">Share of runs</th></tr></thead>
<tbody>
<tr><td>Triage runs</td><td class="num">${n(r.runs)}</td><td class="num">${r.runs ? "100%" : "Not enough data"}</td></tr>
<tr><td>Completed with a model recommendation</td><td class="num">${n(r.completed)}</td><td class="num">${e(share(r.completed, r.runs))}</td></tr>
<tr><td>Locked to human review by policy</td><td class="num">${n(r.locked)}</td><td class="num">${e(share(r.locked, r.runs))}</td></tr>
<tr><td>Abstained for lack of data</td><td class="num">${n(r.abstained)}</td><td class="num">${e(share(r.abstained, r.runs))}</td></tr>
<tr><td>Rationale passed citation validation</td><td class="num">${e(pct(r.citationValidRate))}</td><td class="num">of completed runs</td></tr>
<tr><td>Average cost per run</td><td class="num">${e(usd(r.avgCostUsd))}</td><td class="num"></td></tr>
</tbody>
</table>
<h3>Agreement by alert type</h3>
<table>
<thead><tr><th>Alert type</th><th class="num">Alerts</th><th class="num">QA sampled</th><th class="num">QA agreement</th><th class="num">Shadow agreement</th><th class="num">Autonomy</th></tr></thead>
<tbody>${typologyRows}${
    typologyStats.length > 1
      ? `<tr><td><b>All types</b></td><td class="num"><b>${n(totals.alerts)}</b></td><td class="num"><b>${n(totals.qa)}</b></td><td></td><td></td><td></td></tr>`
      : ""
  }</tbody>
</table>
<p class="muted">QA agreement is the share of sampled agent-assisted decisions a QA reviewer agreed with. Shadow agreement is the share of L0 alerts where the analyst's independent decision matched the hidden recommendation. Small samples are noisy; read them with their counts.</p>
<h3>Recommended monitoring</h3>
<ul>
<li>Review QA agreement, override rate, missed escalations and lock and abstain rates per alert type every week.</li>
<li>If QA agreement drops or missed escalations rise for an alert type, return that type to L1 until the cause is understood.</li>
<li>Treat a fall in citation validity below its usual level as a model quality incident.</li>
</ul>
</section>

<section>
${h2(6)}
<table>
<thead><tr><th>Risk</th><th>Mitigation and residual risk</th></tr></thead>
<tbody>
<tr><td>Prompt injection through customer-supplied text</td><td>Memos and counterparty names are scanned for instruction-like content; a hit locks the alert to a human and the text is not sent to the model. Claims are validated against records, so injected content cannot add facts. Residual: novel phrasing may evade the scanner, which is why closes still need a human below L3.</td></tr>
<tr><td>Hallucinated or misread evidence</td><td>Every claim must cite records and dollar figures are checked against them. Failures downgrade to human review. Residual: a correctly cited claim can still be weighed poorly.</td></tr>
<tr><td>Synthetic data in demo workspaces</td><td>Demo statistics come from synthetic scenarios and seeded history. They show how the controls behave, not how the agent performs on a real portfolio.</td></tr>
<tr><td>No independent validation yet</td><td>This pack is self-prepared. Independent validation of conceptual soundness, outcomes analysis and ongoing monitoring is still required before any alert type moves above L1 in production.</td></tr>
<tr><td>Model drift and provider changes</td><td>Model and prompt changes can shift behavior without code changes. Each run records the model name and policy version; a model change should restart a shadow period and QA baselines for each alert type.</td></tr>
<tr><td>Typology coverage</td><td>Deterministic checks exist for the listed typologies only. Alerts outside them rely more on model judgment and stay at L1.</td></tr>
<tr><td>Cost estimates</td><td>Cost per run is computed from token counts and list prices and may be marked as estimated.</td></tr>
</tbody>
</table>
</section>

<section>
${h2(7)}
<ul>
<li><b>Prompt versioning.</b> The system prompt is hashed into a prompt version${model.promptVersion ? ` (currently ${e(model.promptVersion)})` : ""}. Every run stores the prompt version next to the model and policy version, so a change to the instructions shows up in the run record and the audit log even when no setting changed.</li>
<li><b>Policy versioning.</b> Thresholds, autonomy levels and provider settings live in a versioned policy. Every change creates a new version, and every triage run stores the version it ran under, so any recommendation can be traced to the exact controls in force.</li>
<li><b>Who can change policy.</b> Only workspace owners and admins can change policy, and each change is recorded in the audit log. The agent cannot change its own policy or thresholds.</li>
<li><b>Audit hash chain.</b> Triage runs, analyst and L2 decisions, QA results, policy changes and API key events are written to an append-only audit log. Each event's SHA-256 hash covers the previous event's hash, so editing or deleting any past event breaks the chain and is detected by verification.</li>
<li><b>Promotion and demotion.</b> Raising an alert type's autonomy level requires the QA evidence in section 5 and sign-off below. Lowering a level takes effect immediately.</li>
</ul>
</section>

<section>
${h2(8)}
<p>Signatures confirm review of this pack for policy v${e(String(policy.version))}. They do not approve any SAR decision.</p>
<table class="sign">
<thead><tr><th style="width:24%">Role</th><th style="width:30%">Name</th><th style="width:30%">Signature</th><th style="width:16%">Date</th></tr></thead>
<tbody>
<tr><td>Model owner</td><td class="line"></td><td class="line"></td><td class="line"></td></tr>
<tr><td>BSA officer</td><td class="line"></td><td class="line"></td><td class="line"></td></tr>
<tr><td>Model risk</td><td class="line"></td><td class="line"></td><td class="line"></td></tr>
</tbody>
</table>
<p class="muted">Classification under the institution's framework: ______________________________</p>
</section>

<footer class="footer"><span>Model risk documentation pack. Generated by Assay from live policy and run data. Draft for review.</span><span>${e(input.workspaceName)}, policy v${e(String(policy.version))}</span></footer>
</main>
</body>
</html>`;
}
