import { handleStripeWebhook } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db/client";

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const db = await getDb();
    const r = await handleStripeWebhook(db, body, req.headers.get("stripe-signature"));
    return Response.json({ received: true, ...r });
  } catch (err) {
    console.error("Stripe webhook rejected", err);
    return new Response("Webhook signature verification failed.", { status: 400 });
  }
}
