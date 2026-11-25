import "server-only";

import { createStripe } from "@repo/billing";
import type { Stripe } from "@repo/billing";

import { billingConfigured, getServerEnv } from "../env";

let cached: Stripe | undefined;

export function isBillingConfigured() {
  return billingConfigured(getServerEnv());
}

export function getStripe(): Stripe {
  const { stripeSecretKey } = getServerEnv();
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  cached ??= createStripe(stripeSecretKey);
  return cached;
}
