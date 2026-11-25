import { vi } from "vitest";
import Stripe from "stripe";

import { createServiceClient } from "@repo/db";

import { env } from "./env";

export const WEBHOOK_SECRET = "whsec_route_test";

export const service = createServiceClient({ url: env.url, secretKey: env.secretKey });

export function stubBillingEnv() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_route");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("SUPABASE_SECRET_KEY", env.secretKey);
}

export const signer = new Stripe("sk_test_signer");

export function signed(type: string, object: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type,
    data: { object },
  });
  return { payload, signature: signer.webhooks.generateTestHeaderString({ payload, secret }) };
}

export function stripeSubscription(customer: string, lookupKey = "pro_monthly") {
  return {
    id: `sub_${crypto.randomUUID().replaceAll("-", "")}`,
    customer,
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    items: {
      data: [
        {
          id: "si_1",
          current_period_end: 1_800_000_000,
          price: { id: "price_1", lookup_key: lookupKey, metadata: {} },
        },
      ],
    },
  };
}
