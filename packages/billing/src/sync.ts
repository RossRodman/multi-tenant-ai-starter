import type { Client } from "@repo/db";
import type Stripe from "stripe";

import { toSubscriptionRow } from "./subscriptions";

export type SyncResult = "synced" | "unknown_customer";

export async function syncSubscription({
  stripe,
  db,
  subscriptionId,
}: {
  stripe: Stripe;
  db: Client;
  subscriptionId: string;
}): Promise<SyncResult> {
  const fetchedAt = new Date().toISOString();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const owner = await db.rpc("billing_organization_for_customer", {
    stripe_customer_id: customerId,
  });
  if (owner.error)
    throw new Error("Could not look up the billing customer", { cause: owner.error });
  if (!owner.data) {
    console.warn("Stripe subscription for an unknown customer", { subscription: subscription.id });
    return "unknown_customer";
  }

  const { error } = await db.rpc("sync_subscription", {
    subscription: toSubscriptionRow(subscription, owner.data),
    fetched_at: fetchedAt,
  });
  if (error) throw new Error("Could not save the subscription", { cause: error });
  return "synced";
}
