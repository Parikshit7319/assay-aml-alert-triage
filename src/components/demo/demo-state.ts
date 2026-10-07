/**
 * Types and pure helpers for the in-browser demo workspace. The state is plain
 * data (dates revive on load) so it can be saved to localStorage and restored.
 */
import type { AlertStatus, DecisionAction, PolicySettings, Typology } from "@/lib/db/schema";
import type { Scenario } from "@/lib/demo/scenarios";
import type { TriageResult, WatchlistRecord } from "@/lib/engine/types";

export const ME = { id: "u-you", name: "You (demo analyst)", role: "analyst" } as const;
export const TEAM: { id: string; name: string; role: "analyst" | "admin" | "reviewer" }[] = [
  { id: ME.id, name: ME.name, role: "analyst" },
  { id: "u-jordan", name: "Jordan Lee", role: "analyst" },
  { id: "u-priya", name: "Priya Shah", role: "analyst" },
  { id: "u-marcus", name: "Marcus Webb", role: "admin" },
];
export const AGENT = "triage-agent@demo";
export const WORKSPACE = "Acme Financial (synthetic)";
export const STORAGE_KEY = "assay.demo.v2";

export interface Run extends TriageResult {
  id: string;
  startedAt: Date;
  policyVersion: number;
}
export interface Decision {
  id: string;
  actorType: "human" | "agent";
  actorName: string;
  action: DecisionAction;
  reasonCode: string | null;
  note: string | null;
  createdAt: Date;
}
export interface Note {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  kind: "note" | "handoff";
  createdAt: Date;
}
export interface DemoAlert {
  id: string;
  s: Scenario;
  status: AlertStatus;
  createdAt: Date;
  slaDueAt: Date;
  suspicionDeterminedAt: Date | null;
  sarDueAt: Date | null;
  runs: Run[];
  decisions: Decision[];
  assigneeId: string | null;
  notes: Note[];
  source: "seed" | "csv" | "live";
}
export interface Qa {
  id: string;
  alertId: string;
  typology: Typology;
  sampledAt: Date;
  result: "agree" | "disagree" | null;
  note: string | null;
  reviewedAt: Date | null;
}
export interface Audit {
  seq: number;
  ts: Date;
  actorType: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  prevHash: string;
  hash: string;
}
export interface State {
  seed: number;
  createdAt: Date;
  settings: PolicySettings;
  watchlist: WatchlistRecord[];
  alerts: DemoAlert[];
  qa: Qa[];
  audit: Audit[];
}

export type View =
  | { name: "queue"; filter: "open" | "closed" | "escalated" }
  | { name: "alert"; id: string }
  | { name: "customer"; id: string; from?: string }
  | { name: "l2" }
  | { name: "qa" }
  | { name: "team" }
  | { name: "shadow" }
  | { name: "policy" }
  | { name: "metrics" }
  | { name: "audit" };

export const latest = (a: DemoAlert) => a.runs[0];
export const isOpen = (s: AlertStatus) => s === "new" || s === "triaged" || s === "locked";
export const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");

/** Same canonical JSON as the server's audit chain (src/lib/audit.ts), so exports verify the same way. */
export function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function auditBody(e: Pick<Audit, "ts" | "actorType" | "actorName" | "action" | "entityType" | "entityId" | "detail">): string {
  return stable({ ts: e.ts.toISOString(), actorType: e.actorType, actorName: e.actorName, action: e.action, entityType: e.entityType, entityId: e.entityId, payload: e.detail ? { detail: e.detail } : {} });
}

/** Recomputes every hash. Returns the first broken sequence number, or null when intact. */
export async function verifyChain(audit: Audit[]): Promise<{ ok: boolean; brokenAt: number | null; head: string }> {
  let prev = "0".repeat(64);
  for (const e of audit) {
    const expected = await sha256(prev + auditBody(e));
    if (e.prevHash !== prev || e.hash !== expected) return { ok: false, brokenAt: e.seq, head: prev };
    prev = e.hash;
  }
  return { ok: true, brokenAt: null, head: prev };
}

/** Rough check that saved state has the shape this build expects. */
export function looksLikeState(x: unknown): x is State {
  const s = x as State | null;
  return !!s && typeof s.seed === "number" && Array.isArray(s.alerts) && Array.isArray(s.audit) && Array.isArray(s.qa) && !!s.settings && Array.isArray(s.watchlist);
}
