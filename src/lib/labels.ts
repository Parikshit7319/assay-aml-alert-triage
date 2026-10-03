import type { AlertStatus, Recommendation, Typology } from "./db/schema";

export const TYPOLOGY_LABEL: Record<Typology, string> = {
  structuring: "Structuring",
  funnel_account: "Funnel account",
  high_risk_wire: "High-risk wire",
  sanctions_name: "Watchlist name",
  payroll_pattern: "Payroll pattern",
  seasonal_cash: "Seasonal cash",
  other: "Other",
};

export const TYPOLOGIES = Object.keys(TYPOLOGY_LABEL) as Typology[];

export const STATUS_LABEL: Record<AlertStatus, string> = {
  new: "Untriaged",
  triaged: "Ready for review",
  locked: "Locked to human",
  closed: "Closed",
  escalated: "Escalated to L2",
  sar_filed: "SAR filed",
  no_sar: "Closed, no SAR",
};

export const REC_LABEL: Record<Recommendation, string> = {
  close: "Close",
  escalate: "Escalate",
  human_review: "Needs review",
};

export const ACTION_LABEL: Record<string, string> = {
  accept_close: "Accepted close",
  override_to_close: "Overrode to close",
  accept_escalate: "Accepted escalation",
  override_to_escalate: "Overrode to escalate",
  batch_close: "Batch close",
  auto_close: "Auto-closed",
  sar_file: "SAR filed",
  sar_no_file: "Closed with no SAR",
};

export function ago(from: Date, now = new Date()): string {
  const mins = Math.round((now.getTime() - from.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function daysLeft(due: Date, now = new Date()): number {
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}

export function fmtDateTime(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function fmtDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const OVERRIDE_REASONS = [
  { code: "documented_purpose", label: "Documented business purpose the agent did not weigh" },
  { code: "customer_history", label: "Customer history explains the activity" },
  { code: "missing_evidence", label: "Agent missed or misread evidence" },
  { code: "new_information", label: "New information outside the system" },
  { code: "policy_requirement", label: "Internal policy requires a different outcome" },
  { code: "risk_judgment", label: "Analyst risk judgment" },
] as const;
