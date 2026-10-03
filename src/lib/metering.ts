import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { usageEvents, workspaces } from "./db/schema";
import { DEMO_RUN_LIMIT, PLANS } from "./plans";
import { newId, periodOf } from "./util";

type Workspace = typeof workspaces.$inferSelect;

export interface UsageSummary {
  period: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  includedRuns: number | null;
  overageRuns: number;
  overageUsd: number;
  avgCostPerRunUsd: number;
}

export async function usageForPeriod(db: DB, ws: Workspace, period = periodOf(new Date())): Promise<UsageSummary> {
  const [row] = await db
    .select({
      runs: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${usageEvents.costMicros}), 0)::bigint`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.workspaceId, ws.id), eq(usageEvents.period, period)));
  const plan = PLANS[ws.plan];
  const runs = Number(row?.runs ?? 0);
  const overageRuns = plan.includedRuns != null && plan.overagePerRunUsd != null ? Math.max(0, runs - plan.includedRuns) : 0;
  const costMicros = Number(row?.costMicros ?? 0);
  return {
    period,
    runs,
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    costMicros,
    includedRuns: plan.includedRuns,
    overageRuns,
    overageUsd: overageRuns * (plan.overagePerRunUsd ?? 0),
    avgCostPerRunUsd: runs ? costMicros / runs / 1_000_000 : 0,
  };
}

/** Whether another triage run is allowed right now, and why not if it isn't. */
export async function canRun(db: DB, ws: Workspace, count = 1): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (ws.kind === "demo") {
    const u = await usageForPeriod(db, ws);
    return u.runs + count <= DEMO_RUN_LIMIT ? { ok: true } : { ok: false, reason: `This demo workspace has used its ${DEMO_RUN_LIMIT} runs. Start a new demo to continue.` };
  }
  const plan = PLANS[ws.plan];
  if (ws.plan !== "sandbox" && ws.subscriptionStatus && !["active", "trialing"].includes(ws.subscriptionStatus)) {
    return { ok: false, reason: `Billing status is "${ws.subscriptionStatus}". Update payment details on the Billing page to resume triage.` };
  }
  if (plan.overagePerRunUsd == null && plan.includedRuns != null) {
    const u = await usageForPeriod(db, ws);
    if (u.runs + count > plan.includedRuns) {
      return { ok: false, reason: `The ${plan.name} plan includes ${plan.includedRuns} runs a month and this workspace has used ${u.runs}. Upgrade to Team to keep going.` };
    }
  }
  return { ok: true };
}

export async function recordUsage(
  db: DB,
  ws: Workspace,
  run: { inputTokens: number; outputTokens: number; costMicros: number },
): Promise<string> {
  const id = newId("USE", 8);
  const now = new Date();
  await db.insert(usageEvents).values({
    id,
    workspaceId: ws.id,
    ts: now,
    period: periodOf(now),
    kind: "triage_run",
    quantity: 1,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    costMicros: run.costMicros,
  });
  return id;
}
