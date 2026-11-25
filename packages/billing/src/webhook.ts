import type { Client } from "@repo/db";
import type Stripe from "stripe";

import { expireOpenCheckoutSessions } from "./checkout";
import { syncSubscription } from "./sync";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

function subscriptionIdOf(event: Stripe.Event): string | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode !== "subscription" || !session.subscription) return null;
    return typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  }
  if (SUBSCRIPTION_EVENTS.has(event.type)) return (event.data.object as Stripe.Subscription).id;
  return null;
}

export async function handleWebhook({
  stripe,
  db,
  payload,
  signature,
  secret,
}: {
  stripe: Stripe;
  db: Client;
  payload: string;
  signature: string | null;
  secret: string;
}): Promise<{ status: 200 | 400 | 500 }> {
  if (!signature) return { status: 400 };

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return { status: 400 };
  }

  const subscriptionId = subscriptionIdOf(event);
  if (!subscriptionId) return { status: 200 };

  try {
    await syncSubscription({ stripe, db, subscriptionId });
    if (event.type === "checkout.session.completed") await closeOtherSessions(stripe, event);
    return { status: 200 };
  } catch (error) {
    console.error("Stripe webhook failed", {
      event: event.id,
      type: event.type,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: 500 };
  }
}

async function closeOtherSessions(stripe: Stripe, event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return;
  try {
    await expireOpenCheckoutSessions({ stripe, customerId, keepSessionId: session.id });
  } catch (error) {
    console.error("Could not expire open Checkout sessions", {
      event: event.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
