import Stripe from "stripe";

export type { Stripe };

export function createStripe(secretKey: string) {
  return new Stripe(secretKey, { maxNetworkRetries: 2 });
}
