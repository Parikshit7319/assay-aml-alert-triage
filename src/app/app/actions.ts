"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appendAudit } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { createCheckoutSession, createPortalSession, stripeConfigured } from "@/lib/billing/stripe";
import { alerts, apiKeys, workspaces, type AutonomyLevel, type PolicySettings, type Typology } from "@/lib/db/schema";
import { triageAlert } from "@/lib/engine/run";
import { importAlertsCsv } from "@/lib/importer";
import { TYPOLOGIES } from "@/lib/labels";
import { canAdminister, requireTenant } from "@/lib/tenant";
import { newId } from "@/lib/util";
import { batchClose, decideL1, markSuspicious, recordSarDecision, reviewQa, updatePolicy, WorkflowError } from "@/lib/workflow";

import type { ActionState } from "@/lib/action-types";
export type { ActionState };

function fail(err: unknown): ActionState {
  if (err instanceof WorkflowError) return { error: err.message };
  if (err instanceof Error && /redirect|NEXT_/.test(err.message)) throw err;
  console.error(err);
  return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export async function decideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const alertId = str(fd, "alertId");
  const outcome = str(fd, "outcome") as "close" | "escalate";
  try {
    await decideL1(t.db, t.ws, {
      alertId,
      outcome,
      reasonCode: str(fd, "reasonCode") || undefined,
      note: str(fd, "note") || undefined,
      actor: t.actor,
      seconds: Number(str(fd, "seconds")) || 0,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/app", "layout");
  return { ok: outcome === "close" ? "Closed." : "Escalated to L2." };
}

export async function batchCloseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const ids = fd.getAll("alertId").map(String);
  try {
    const r = await batchClose(t.db, t.ws, { alertIds: ids, actor: t.actor });
    revalidatePath("/app", "layout");
    return { ok: `Closed ${r.closed} alert${r.closed === 1 ? "" : "s"}. ${r.sampled} sampled for QA.${r.skipped ? ` ${r.skipped} skipped as not eligible.` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function markSuspiciousAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  try {
    const r = await markSuspicious(t.db, t.ws, {
      alertId: str(fd, "alertId"),
      noSuspect: fd.get("noSuspect") === "on",
      actor: t.actor,
      seconds: Number(str(fd, "seconds")) || 0,
      note: str(fd, "note") || undefined,
    });
    revalidatePath("/app", "layout");
    return { ok: `SAR clock started. Due ${r.sarDueAt.toISOString().slice(0, 10)}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function sarDecisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const file = str(fd, "decision") === "file";
  try {
    await recordSarDecision(t.db, t.ws, { alertId: str(fd, "alertId"), file, actor: t.actor, seconds: Number(str(fd, "seconds")) || 0, note: str(fd, "note") || undefined });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/app", "layout");
  return { ok: file ? "SAR filing recorded." : "Closed with no SAR." };
}

export async function qaReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  try {
    await reviewQa(t.db, t.ws, { qaId: str(fd, "qaId"), result: str(fd, "result") as "agree" | "disagree", actor: t.actor, note: str(fd, "note") || undefined });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/app", "layout");
  return { ok: "QA review recorded." };
}

export async function rerunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const alertId = str(fd, "alertId");
  try {
    const [a] = await t.db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.workspaceId, t.ws.id)));
    if (!a) return { error: "Alert not found." };
    if (!["new", "triaged", "locked"].includes(a.status)) return { error: "Only open alerts can be re-run." };
    const r = await triageAlert(t.db, t.ws, alertId, { initiatedBy: t.actor });
    revalidatePath("/app", "layout");
    return { ok: `Re-run complete: ${r.result.recommendation.replace("_", " ")} with policy v${t.ws.settings.version}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function triageQueueAction(_: ActionState): Promise<ActionState> {
  const t = await requireTenant();
  const pending = await t.db.select({ id: alerts.id }).from(alerts).where(and(eq(alerts.workspaceId, t.ws.id), eq(alerts.status, "new"))).limit(100);
  let done = 0;
  try {
    for (const p of pending) {
      await triageAlert(t.db, t.ws, p.id, { initiatedBy: t.actor });
      done++;
    }
  } catch (e) {
    revalidatePath("/app", "layout");
    return { error: `Triaged ${done} of ${pending.length}. ${e instanceof Error ? e.message : ""}` };
  }
  revalidatePath("/app", "layout");
  return { ok: `Triaged ${done} alert${done === 1 ? "" : "s"}.` };
}

const num = (fd: FormData, k: string, min: number, max: number) => {
  const v = Number(str(fd, k));
  if (!Number.isFinite(v) || v < min || v > max) throw new WorkflowError(`${k} must be between ${min} and ${max}.`);
  return v;
};

export async function updatePolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  if (!canAdminister(t)) return { error: "Only workspace owners and admins can change policy." };
  try {
    const autonomy = {} as Record<Typology, AutonomyLevel>;
    for (const ty of TYPOLOGIES) {
      const lvl = Number(str(fd, `autonomy_${ty}`)) as AutonomyLevel;
      if (![0, 1, 2, 3].includes(lvl)) throw new WorkflowError("Autonomy levels run from 0 to 3.");
      if (lvl === 3 && fd.get("l3_attest") !== "on") {
        throw new WorkflowError("Auto-close needs the sign-off box ticked: 98% agreement on 2,000 QA-reviewed alerts and written approval.");
      }
      autonomy[ty] = lvl;
    }
    const provider = str(fd, "provider") as PolicySettings["provider"];
    if (!["simulated", "anthropic", "openai", "azure-openai"].includes(provider)) throw new WorkflowError("Unknown model provider.");
    const next: Omit<PolicySettings, "version"> = {
      autonomy,
      closeConfidenceFloor: num(fd, "closeConfidenceFloor", 0.5, 0.99),
      autoCloseConfidenceFloor: num(fd, "autoCloseConfidenceFloor", 0.8, 0.999),
      watchlistForceL2Similarity: num(fd, "watchlistForceL2Similarity", 0.7, 0.99),
      minTransactionsForDecision: Math.round(num(fd, "minTransactionsForDecision", 1, 100)),
      qaSampleRate: num(fd, "qaSampleRate", 0.01, 1),
      rationaleDepth: str(fd, "rationaleDepth") === "standard" ? "standard" : "full",
      internalSlaDays: Math.round(num(fd, "internalSlaDays", 1, 120)),
      provider,
    };
    if (next.autoCloseConfidenceFloor < next.closeConfidenceFloor) throw new WorkflowError("The auto-close floor cannot be below the close floor.");
    const s = await updatePolicy(t.db, t.ws, next, t.actor);
    revalidatePath("/app", "layout");
    return { ok: s.version === t.ws.settings.version ? "No changes to save." : `Saved as policy v${s.version}. New runs use it; past runs keep the version they ran under.` };
  } catch (e) {
    return fail(e);
  }
}

export async function renameWorkspaceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  if (!canAdminister(t)) return { error: "Only owners and admins can rename the workspace." };
  const name = str(fd, "name").slice(0, 80);
  if (name.length < 2) return { error: "Enter a workspace name." };
  await t.db.update(workspaces).set({ name }).where(eq(workspaces.id, t.ws.id));
  await appendAudit(t.db, { workspaceId: t.ws.id, actorType: "human", actorName: t.actor, action: "workspace.renamed", entityType: "workspace", entityId: t.ws.id, payload: { from: t.ws.name, to: name } });
  revalidatePath("/app", "layout");
  return { ok: "Workspace renamed." };
}

export async function importCsvAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };
  if (file.size > 5 * 1024 * 1024) return { error: "The file is over 5 MB. Split it or use the API." };
  try {
    const r = await importAlertsCsv(t.db, t.ws, await file.text(), t.actor);
    revalidatePath("/app", "layout");
    if (r.errors.length && !r.alerts) return { error: r.errors.slice(0, 5).join(" ") };
    return {
      ok: `Imported ${r.alerts} alert${r.alerts === 1 ? "" : "s"} with ${r.transactions} transactions. Triaged ${r.triaged}.${r.errors.length ? ` ${r.errors.length} row issue(s): ${r.errors.slice(0, 3).join(" ")}` : ""}`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function createApiKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  if (!canAdminister(t)) return { error: "Only owners and admins can create API keys." };
  if (t.mode === "demo") return { error: "API keys are disabled in the demo. Create an account to use the API." };
  const name = str(fd, "name").slice(0, 60) || "Unnamed key";
  const secret = `ask_${randomBytes(24).toString("base64url")}`;
  const id = newId("KEY");
  await t.db.insert(apiKeys).values({ id, workspaceId: t.ws.id, name, prefix: secret.slice(0, 10), hash: createHash("sha256").update(secret).digest("hex") });
  await appendAudit(t.db, { workspaceId: t.ws.id, actorType: "human", actorName: t.actor, action: "api_key.created", entityType: "api_key", entityId: id, payload: { name, prefix: secret.slice(0, 10) } });
  revalidatePath("/app/developers");
  return { ok: "Key created. Copy it now; it is shown once.", secret };
}

export async function revokeApiKeyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  if (!canAdminister(t)) return { error: "Only owners and admins can revoke API keys." };
  const id = str(fd, "keyId");
  await t.db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, t.ws.id)));
  await appendAudit(t.db, { workspaceId: t.ws.id, actorType: "human", actorName: t.actor, action: "api_key.revoked", entityType: "api_key", entityId: id });
  revalidatePath("/app/developers");
  return { ok: "Key revoked." };
}

export async function checkoutAction(_: ActionState): Promise<ActionState> {
  const t = await requireTenant();
  if (t.mode === "demo") return { error: "Billing is disabled in the demo workspace." };
  if (!canAdminister(t)) return { error: "Only owners and admins can change the plan." };
  if (!stripeConfigured()) return { error: "Billing is not configured on this deployment. Set the Stripe keys described in the README." };
  const url = await createCheckoutSession(t.db, t.ws, t.user!.email, (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
  redirect(url);
}

export async function portalAction(_: ActionState): Promise<ActionState> {
  const t = await requireTenant();
  if (!stripeConfigured() || !t.ws.stripeCustomerId) return { error: "No billing account yet." };
  const url = await createPortalSession(t.ws.stripeCustomerId, (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
  redirect(url);
}

export async function signOutAction() {
  const auth = await getAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
