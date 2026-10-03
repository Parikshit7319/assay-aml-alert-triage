import "server-only";
import { createHash } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { auditEvents } from "./db/schema";

export const GENESIS = "0".repeat(64);

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export interface AuditInput {
  workspaceId: string;
  actorType: "human" | "agent" | "system";
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  ts?: Date;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

export function hashEvent(prevHash: string, e: Omit<AuditInput, "workspaceId"> & { ts: Date; payload: Record<string, unknown> }): string {
  const body = stable({
    ts: e.ts.toISOString(),
    actorType: e.actorType,
    actorName: e.actorName,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    payload: e.payload,
  });
  return createHash("sha256").update(prevHash).update(body).digest("hex");
}

/** Appends one event. A per-workspace advisory lock keeps the chain linear under concurrency. */
export async function appendAudit(db: DB | Tx, input: AuditInput): Promise<void> {
  const run = async (tx: Tx | DB) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}))`);
    const [last] = await tx
      .select({ hash: auditEvents.hash })
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, input.workspaceId))
      .orderBy(desc(auditEvents.seq))
      .limit(1);
    const prevHash = last?.hash ?? GENESIS;
    const ts = input.ts ?? new Date();
    const payload = input.payload ?? {};
    const hash = hashEvent(prevHash, { ...input, ts, payload });
    await tx.insert(auditEvents).values({ ...input, ts, payload, prevHash, hash });
  };
  // On a transaction handle this becomes a savepoint; the advisory lock holds until the outer commit.
  await (db as DB).transaction(async (tx) => run(tx));
}

export interface ChainCheck {
  ok: boolean;
  events: number;
  brokenAtSeq: number | null;
  headHash: string;
}

export async function verifyChain(db: DB, workspaceId: string): Promise<ChainCheck> {
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(asc(auditEvents.seq));
  let prev = GENESIS;
  for (const r of rows) {
    const expected = hashEvent(prev, {
      ts: r.ts,
      actorType: r.actorType,
      actorName: r.actorName,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      payload: r.payload,
    });
    if (r.prevHash !== prev || r.hash !== expected) {
      return { ok: false, events: rows.length, brokenAtSeq: r.seq, headHash: prev };
    }
    prev = r.hash;
  }
  return { ok: true, events: rows.length, brokenAtSeq: null, headHash: prev };
}
