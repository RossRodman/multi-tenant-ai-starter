import { describe, expect, it, vi } from "vitest";

import { signed, stripeSubscription } from "./billing-helpers";

vi.stubEnv("STRIPE_SECRET_KEY", "");
vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

const { POST } = await import("../src/app/api/stripe/webhook/route");

describe("POST /api/stripe/webhook without Stripe configuration", () => {
  it("answers 503", async () => {
    const { payload, signature } = signed(
      "customer.subscription.created",
      stripeSubscription("cus_1"),
    );
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": signature },
      }),
    );
    expect(response.status).toBe(503);
  });
});
