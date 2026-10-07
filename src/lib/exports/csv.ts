/**
 * CSV and JSON exports. Pure functions with no browser or Node dependencies.
 *
 * Output follows RFC 4180: CRLF line endings, fields wrapped in double quotes
 * when they contain a comma, double quote, CR or LF, and embedded double quotes
 * doubled. Customer-supplied text (memos, counterparty names) is untrusted, so
 * string cells that start with a spreadsheet formula trigger are prefixed with
 * a single quote by default (OWASP CSV injection guidance). Pass
 * `{ formulaGuard: false }` when byte-for-byte fidelity matters more.
 */
import { ACTION_LABEL } from "@/lib/labels";

export interface CsvOptions {
  /** Prefix string cells that start with = + - @ tab or CR with a single quote. Default true. */
  formulaGuard?: boolean;
}

const NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

/** Formats one field per RFC 4180. */
export function csvField(value: unknown, opts: CsvOptions = {}): string {
  let s = cellText(value);
  if ((opts.formulaGuard ?? true) && typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialises rows to CSV with a header line. Columns default to every key seen,
 * in first-seen order. Missing keys become empty cells.
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[], opts: CsvOptions = {}): string {
  const cols =
    columns ??
    rows.reduce<string[]>((acc, r) => {
      for (const k of Object.keys(r)) if (!acc.includes(k)) acc.push(k);
      return acc;
    }, []);
  const lines = [cols.map((c) => csvField(c, { formulaGuard: false })).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvField(r[c], opts)).join(","));
  return lines.join("\r\n") + "\r\n";
}

const iso = (d: string | Date | null | undefined): string | null => {
  if (d === null || d === undefined) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? (typeof d === "string" ? d : null) : x.toISOString();
};

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export interface AuditEventLike {
  seq: number;
  ts: string | Date;
  actorType: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown> | null;
  prevHash?: string | null;
  hash?: string | null;
}

export interface AuditExportMeta {
  workspaceName?: string;
  workspaceId?: string;
  exportedAt?: string;
  exportedBy?: string;
  chain?: { ok: boolean; events: number; brokenAtSeq: number | null; headHash: string };
  [key: string]: unknown;
}

const AUDIT_COLUMNS = ["seq", "ts", "actor_type", "actor_name", "action", "entity_type", "entity_id", "payload", "prev_hash", "hash"];

export function auditToCsv(events: AuditEventLike[], opts?: CsvOptions): string {
  return toCsv(
    events.map((e) => ({
      seq: e.seq,
      ts: iso(e.ts),
      actor_type: e.actorType,
      actor_name: e.actorName,
      action: e.action,
      entity_type: e.entityType,
      entity_id: e.entityId,
      payload: e.payload ? JSON.stringify(e.payload) : "",
      prev_hash: e.prevHash ?? "",
      hash: e.hash ?? "",
    })),
    AUDIT_COLUMNS,
    opts,
  );
}

/**
 * Full-fidelity audit export. Timestamps are ISO 8601 so each hash can be
 * recomputed as sha256(prev_hash + canonical JSON of the event body).
 */
export function auditToJson(events: AuditEventLike[], meta: AuditExportMeta = {}): string {
  const { exportedAt, ...rest } = meta;
  const doc = {
    format: "assay.audit.v1",
    exportedAt: exportedAt ?? new Date().toISOString(),
    ...rest,
    hashing: {
      algorithm: "sha256",
      chain: "hash = sha256(prevHash + canonicalJson({ ts, actorType, actorName, action, entityType, entityId, payload }))",
      canonicalJson: "Object keys sorted, undefined values dropped, no whitespace.",
      genesisPrevHash: "0".repeat(64),
    },
    eventCount: events.length,
    events: events.map((e) => ({
      seq: e.seq,
      ts: iso(e.ts),
      actorType: e.actorType,
      actorName: e.actorName,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      payload: e.payload ?? {},
      prevHash: e.prevHash ?? null,
      hash: e.hash ?? null,
    })),
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/* ------------------------------------------------------------------ */
/* QA reviews                                                          */
/* ------------------------------------------------------------------ */

export interface QaItemLike {
  id?: string;
  alertId: string;
  typology: string;
  sampledAt: string | Date;
  reviewer?: string | null;
  result?: "agree" | "disagree" | null | string;
  note?: string | null;
  reviewedAt?: string | Date | null;
  agentRecommendation?: string | null;
  humanDecision?: string | null;
}

const QA_COLUMNS = ["id", "alert_id", "typology", "sampled_at", "agent_recommendation", "human_decision", "reviewer", "result", "reviewed_at", "note"];

export function qaToCsv(items: QaItemLike[], opts?: CsvOptions): string {
  return toCsv(
    items.map((q) => ({
      id: q.id ?? "",
      alert_id: q.alertId,
      typology: q.typology,
      sampled_at: iso(q.sampledAt),
      agent_recommendation: q.agentRecommendation ?? "",
      human_decision: q.humanDecision ?? "",
      reviewer: q.reviewer ?? "",
      result: q.result ?? "pending",
      reviewed_at: iso(q.reviewedAt),
      note: q.note ?? "",
    })),
    QA_COLUMNS,
    opts,
  );
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export interface DecisionLike {
  id?: string;
  alertId: string;
  runId?: string | null;
  typology?: string | null;
  actorType: string;
  actorName: string;
  action: string;
  reasonCode?: string | null;
  note?: string | null;
  agreedWithAgent?: boolean | null;
  createdAt: string | Date;
}

const DECISION_COLUMNS = ["id", "created_at", "alert_id", "typology", "run_id", "actor_type", "actor_name", "action", "action_label", "agreed_with_agent", "reason_code", "note"];

export function decisionsToCsv(items: DecisionLike[], opts?: CsvOptions): string {
  return toCsv(
    items.map((d) => ({
      id: d.id ?? "",
      created_at: iso(d.createdAt),
      alert_id: d.alertId,
      typology: d.typology ?? "",
      run_id: d.runId ?? "",
      actor_type: d.actorType,
      actor_name: d.actorName,
      action: d.action,
      action_label: ACTION_LABEL[d.action] ?? d.action,
      agreed_with_agent: d.agreedWithAgent === null || d.agreedWithAgent === undefined ? "" : d.agreedWithAgent ? "yes" : "no",
      reason_code: d.reasonCode ?? "",
      note: d.note ?? "",
    })),
    DECISION_COLUMNS,
    opts,
  );
}
