"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-types";
import type { WebhookFormat, WebhookSettings } from "@/lib/db/schema";
import { canAdminister, requireTenant, type Tenant } from "@/lib/tenant";
import { dispatchWebhook, isSubscribableEvent, newWebhookSecret, saveWebhookSettings, TEST_ALERT, validateWebhookUrl } from "@/lib/webhooks";
import { appBaseUrl } from "@/lib/app-url";

const FORMATS: WebhookFormat[] = ["json", "slack", "teams"];

function guard(t: Tenant): string | null {
  if (t.mode === "demo") return "Webhooks are off in the demo workspace. Create an account to send events to your own endpoint.";
  if (!canAdminister(t)) return "Only workspace owners and admins can change the webhook.";
  return null;
}

function fail(err: unknown): ActionState {
  if (err instanceof Error && /redirect|NEXT_/.test(err.message)) throw err;
  console.error(err);
  return { error: "Could not save the webhook. Try again." };
}

/** Fields: url, format ("json" | "slack" | "teams"), events (repeated). Creates a signing secret on first save and returns it once. */
export async function saveWebhookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = await requireTenant();
  const denied = guard(t);
  if (denied) return { error: denied };
  const check = validateWebhookUrl(String(fd.get("url") ?? ""));
  if (!check.ok) return { error: check.error };
  const format = String(fd.get("format") ?? "json") as WebhookFormat;
  if (!FORMATS.includes(format)) return { error: "Choose JSON, Slack or Teams." };
  const events = [...new Set(fd.getAll("events").map(String))].filter(isSubscribableEvent);
  if (!events.length) return { error: "Pick at least one event to send." };
  const existing = t.ws.settings.webhook;
  const secret = existing?.secret || newWebhookSecret();
  const next: WebhookSettings = { url: check.url, format, secret, events };
  try {
    await saveWebhookSettings(t.db, t.ws, next, t.actor);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/app/settings");
  if (!existing?.secret) return { ok: "Webhook saved. Copy the signing secret now; it is shown once.", secret };
  return { ok: "Webhook saved." };
}

/** Replaces the signing secret and returns the new one once. The old one stops working immediately. */
export async function rotateWebhookSecretAction(_: ActionState): Promise<ActionState> {
  const t = await requireTenant();
  const denied = guard(t);
  if (denied) return { error: denied };
  const existing = t.ws.settings.webhook;
  if (!existing) return { error: "Save a webhook first." };
  const secret = newWebhookSecret();
  try {
    await saveWebhookSettings(t.db, t.ws, { ...existing, secret }, t.actor, { secretRotated: true });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/app/settings");
  return { ok: "New secret created. Update your endpoint now; the old secret no longer verifies.", secret };
}

/** Sends a signed "test" event with a synthetic alert and reports what the endpoint answered. */
export async function testWebhookAction(_: ActionState): Promise<ActionState> {
  const t = await requireTenant();
  const denied = guard(t);
  if (denied) return { error: denied };
  if (!t.ws.settings.webhook) return { error: "Save a webhook first." };
  const r = await dispatchWebhook(t.ws, "test", { alert: TEST_ALERT, link: `${appBaseUrl()}/app/settings#webhook` }, { db: t.db, actor: t.actor });
  revalidatePath("/app/audit");
  if (r.ok) return { ok: `Delivered. The endpoint answered ${r.status} in ${r.ms} ms. Delivery ${r.deliveryId.slice(0, 8)}.` };
  return { error: `Not delivered. ${r.error ?? ""}`.trim() };
}

export async function removeWebhookAction(_: ActionState): Promise<ActionState> {
  const t = await requireTenant();
  const denied = guard(t);
  if (denied) return { error: denied };
  if (!t.ws.settings.webhook) return { ok: "No webhook to remove." };
  try {
    await saveWebhookSettings(t.db, t.ws, null, t.actor);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/app/settings");
  return { ok: "Webhook removed. No more events will be sent." };
}
