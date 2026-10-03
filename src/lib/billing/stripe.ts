import "server-only";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { appendAudit } from "@/lib/audit";
import type { DB } from "@/lib/db/client";
import { usageEvents, workspaces } from "@/lib/db/schema";

type Workspace = typeof workspaces.$inferSelect;

/**
 * Billing model: one licensed price for the Team plan (STRIPE_PRICE_TEAM) and
 * one metered price on a Stripe Billing Meter (STRIPE_PRICE_OVERAGE, with the
 * meter's event name in STRIPE_METER_EVENT_NAME). Every triage run is reported
 * to the meter; configure the metered price with a graduated tier of 2,000
 * free units, then $0.60 per unit.
 */
export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_TEAM);
}

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export async function createCheckoutSession(db: DB, ws: Workspace, email: string, origin: string): Promise<string> {
  let customerId = ws.stripeCustomerId;
  if (!customerId) {
    const c = await stripe().customers.create({ email, name: ws.name, metadata: { workspaceId: ws.id } });
    customerId = c.id;
    await db.update(workspaces).set({ stripeCustomerId: customerId }).where(eq(workspaces.id, ws.id));
  }
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: process.env.STRIPE_PRICE_TEAM!, quantity: 1 }];
  if (process.env.STRIPE_PRICE_OVERAGE) lineItems.push({ price: process.env.STRIPE_PRICE_OVERAGE });
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: ws.id,
    line_items: lineItems,
    subscription_data: { metadata: { workspaceId: ws.id } },
    metadata: { workspaceId: ws.id },
    success_url: `${origin}/app/billing?checkout=success`,
    cancel_url: `${origin}/app/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(customerId: string, origin: string): Promise<string> {
  const s = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/app/billing` });
  return s.url;
}

export async function reportUsageToStripe(db: DB, ws: Workspace, usageEventId: string): Promise<void> {
  const eventName = process.env.STRIPE_METER_EVENT_NAME;
  if (!stripeConfigured() || !eventName || !ws.stripeCustomerId || ws.plan !== "team") return;
  await stripe().billing.meterEvents.create({
    event_name: eventName,
    identifier: usageEventId,
    payload: { stripe_customer_id: ws.stripeCustomerId, value: "1" },
  });
  await db.update(usageEvents).set({ reportedToStripe: true }).where(eq(usageEvents.id, usageEventId));
}

export async function handleStripeWebhook(db: DB, rawBody: string, signature: string | null): Promise<{ handled: boolean; type: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new Error("Missing webhook secret or signature.");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);

  const setPlan = async (workspaceId: string, values: Partial<Workspace>) => {
    await db.update(workspaces).set(values).where(eq(workspaces.id, workspaceId));
    await appendAudit(db, {
      workspaceId,
      actorType: "system",
      actorName: "stripe",
      action: "billing.updated",
      entityType: "workspace",
      entityId: workspaceId,
      payload: { event: event.type, plan: values.plan ?? null, status: values.subscriptionStatus ?? null },
    });
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const workspaceId = s.client_reference_id ?? s.metadata?.workspaceId;
      if (!workspaceId) return { handled: false, type: event.type };
      await setPlan(workspaceId, {
        plan: "team",
        stripeCustomerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
        stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
        subscriptionStatus: "active",
      });
      return { handled: true, type: event.type };
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return { handled: false, type: event.type };
      const deleted = event.type === "customer.subscription.deleted";
      await setPlan(workspaceId, { plan: deleted ? "sandbox" : "team", subscriptionStatus: deleted ? "canceled" : sub.status });
      return { handled: true, type: event.type };
    }
    default:
      return { handled: false, type: event.type };
  }
}
