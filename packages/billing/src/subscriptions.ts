import type { Subscription } from "@repo/db";
import type Stripe from "stripe";

import { planForLookupKey } from "./plans";

export type SubscriptionRow = Omit<Subscription, "created_at" | "updated_at">;

const toIso = (seconds: number | null | undefined) =>
  seconds == null ? null : new Date(seconds * 1000).toISOString();

export function toSubscriptionRow(
  subscription: Stripe.Subscription,
  organizationId: string,
): SubscriptionRow {
  const item = subscription.items.data[0];
  const price = item?.price;
  const key = price?.lookup_key ?? price?.metadata.lookup_key;
  const resolved = key ? planForLookupKey(key) : null;
  if (!item || !resolved) {
    throw new Error(`Subscription ${subscription.id} has no known price`);
  }

  return {
    id: subscription.id,
    organization_id: organizationId,
    plan: resolved.plan,
    interval: resolved.interval,
    status: subscription.status,
    current_period_end: toIso(item.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end || subscription.cancel_at !== null,
    canceled_at: toIso(subscription.canceled_at),
  };
}
