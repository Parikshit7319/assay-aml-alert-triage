import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { appendAudit } from "@/lib/audit";
import type { DB } from "@/lib/db/client";
import { alerts, customers, decisions, metricRollups, priorCases, qaReviews, transactions, watchlistEntries, workspaces } from "@/lib/db/schema";
import { triageAlert } from "@/lib/engine/run";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { DAY, HOUR, hashString, newId, prng } from "@/lib/util";
import { scenarioToBundle } from "./bundle";
import { syntheticRollups } from "./rollups";
import { buildScenarios, type Scenario } from "./scenarios";

export const DEMO_TTL_HOURS = 24;
export const DEMO_ACTOR = "You (demo analyst)";

async function insertChunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function purgeExpiredDemos(db: DB) {
  await db.delete(workspaces).where(and(eq(workspaces.kind, "demo"), lt(workspaces.expiresAt, new Date())));
}

/** Creates a private demo workspace: synthetic customers, 44 alerts, agent runs, QA items and 10 weeks of history. */
export async function createDemoWorkspace(db: DB): Promise<string> {
  await purgeExpiredDemos(db);
  const id = newId("WS", 10);
  const now = new Date();
  const rng = prng(hashString(id));
  const settings = { ...DEFAULT_POLICY };
  await db.insert(workspaces).values({
    id,
    name: "Acme Financial (synthetic)",
    kind: "demo",
    plan: "sandbox",
    settings,
    createdAt: now,
    expiresAt: new Date(now.getTime() + DEMO_TTL_HOURS * HOUR),
  });
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));

  await appendAudit(db, {
    workspaceId: id,
    actorType: "system",
    actorName: "assay",
    action: "workspace.created",
    entityType: "workspace",
    entityId: id,
    ts: new Date(now.getTime() - 11 * DAY),
    payload: { kind: "demo", policyVersion: settings.version, dataset: "synthetic" },
  });

  const { open, recentlyClosed, watchlist } = buildScenarios(rng, now);
  await db.insert(watchlistEntries).values(watchlist.map((w) => ({ ...w, workspaceId: id })));

  const all: { s: Scenario; alertId: string; closed: boolean }[] = [
    ...recentlyClosed.map((s) => ({ s, alertId: newId("ALT"), closed: true })),
    ...open.map((s) => ({ s, alertId: newId("ALT"), closed: false })),
  ];

  await db.insert(customers).values(all.map(({ s }) => ({ ...s.customer, workspaceId: id })));
  const txRows = all.flatMap(({ s }) => s.transactions.map((t) => ({ ...t, workspaceId: id, customerId: s.customer.id })));
  await insertChunked(txRows, 500, (chunk) => db.insert(transactions).values(chunk));
  const caseRows = all.flatMap(({ s }) => s.priorCases.map((c) => ({ ...c, workspaceId: id, customerId: s.customer.id })));
  if (caseRows.length) await db.insert(priorCases).values(caseRows);
  await db.insert(alerts).values(
    all.map(({ s, alertId }) => ({
      id: alertId,
      workspaceId: id,
      customerId: s.customer.id,
      ruleCode: s.alert.ruleCode,
      ruleDescription: s.alert.ruleDescription,
      typology: s.alert.typology,
      source: "seed" as const,
      status: "new" as const,
      triggeredTxnIds: s.alert.triggeredTxnIds,
      createdAt: s.alert.createdAt,
      slaDueAt: new Date(s.alert.createdAt.getTime() + settings.internalSlaDays * DAY),
    })),
  );

  // Triage in creation order so the audit chain reads chronologically.
  const ordered = [...all].sort((a, b) => a.s.alert.createdAt.getTime() - b.s.alert.createdAt.getTime());
  for (const item of ordered) {
    const bundle = scenarioToBundle(item.s, watchlist, item.alertId);
    const { runId } = await triageAlert(db, ws, item.alertId, { bundle, skipLimit: true, now: new Date(item.s.alert.createdAt.getTime() + 2 * 60_000) });
    if (item.closed) {
      const decidedAt = new Date(item.s.alert.createdAt.getTime() + 20 * HOUR);
      await db.insert(decisions).values({
        id: newId("DEC"),
        workspaceId: id,
        alertId: item.alertId,
        runId,
        actorType: "human",
        actorName: "Jordan Lee (L1 analyst)",
        action: "batch_close",
        agreedWithAgent: true,
        createdAt: decidedAt,
      });
      await db.update(alerts).set({ status: "closed", decidedAt, l1Seconds: 25 }).where(eq(alerts.id, item.alertId));
      await db.insert(qaReviews).values({ id: newId("QA"), workspaceId: id, alertId: item.alertId, typology: item.s.alert.typology, sampledAt: decidedAt });
      await appendAudit(db, {
        workspaceId: id,
        actorType: "human",
        actorName: "Jordan Lee (L1 analyst)",
        action: "l1.batch_close",
        entityType: "alert",
        entityId: item.alertId,
        ts: decidedAt,
        payload: { runId, qaSampled: true },
      });
    }
  }

  const rollups = syntheticRollups(rng, now);
  await db.insert(metricRollups).values(rollups.map((r) => ({ ...r, workspaceId: id })));
  return id;
}
