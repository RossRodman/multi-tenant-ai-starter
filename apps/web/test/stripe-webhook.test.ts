import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createOrganization } from "../src/server/organizations";
import { env } from "./env";
import { service, signed, signer, stripeSubscription, stubBillingEnv } from "./billing-helpers";
import { createAdminClient, createUser } from "./harness";

stubBillingEnv();

const subscriptions = new Map<string, ReturnType<typeof stripeSubscription>>();

vi.mock("@/server/billing/stripe", () => ({
  getStripe: () => ({
    webhooks: signer.webhooks,
    subscriptions: {
      retrieve: (id: string) => {
        const subscription = subscriptions.get(id);
        return subscription ? Promise.resolve(subscription) : Promise.reject(new Error("unknown"));
      },
    },
  }),
}));

const { POST } = await import("../src/app/api/stripe/webhook/route");

const db = new pg.Client({ connectionString: env.dbUrl });
let user: Awaited<ReturnType<typeof createUser>>;
let organizationId = "";
let customerId = "";

beforeAll(async () => {
  await db.connect();
  user = await createUser("webhook-owner");
  const slug = `webhook-${crypto.randomUUID().slice(0, 8)}`;
  await createOrganization(user.client, { name: "Hooks", slug });
  const { rows } = await db.query<{ id: string }>(
    "select id from public.organizations where slug = $1",
    [slug],
  );
  organizationId = rows[0]?.id ?? "";
  customerId = `cus_${crypto.randomUUID().replaceAll("-", "")}`;
  await service.rpc("link_billing_customer", {
    organization_id: organizationId,
    stripe_customer_id: customerId,
  });
});

afterAll(async () => {
  await db.query("delete from public.organizations where id = $1", [organizationId]);
  await createAdminClient().auth.admin.deleteUser(user.id);
  await db.end();
});

const request = (payload: string, signature?: string) =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: signature ? { "stripe-signature": signature } : {},
  });

describe("POST /api/stripe/webhook", () => {
  it("stores the subscription of a signed event", async () => {
    const subscription = stripeSubscription(customerId, "team_monthly");
    subscriptions.set(subscription.id, subscription);
    const { payload, signature } = signed("customer.subscription.created", subscription);

    const response = await POST(request(payload, signature));

    expect(response.status).toBe(200);
    const { rows } = await db.query<{ plan: string }>(
      "select plan from public.subscriptions where id = $1",
      [subscription.id],
    );
    expect(rows).toEqual([{ plan: "team" }]);
  });

  it("answers 400 without a signature", async () => {
    const { payload } = signed("customer.subscription.created", stripeSubscription(customerId));
    expect((await POST(request(payload))).status).toBe(400);
  });

  it("answers 400 for a signature made with another secret", async () => {
    const subscription = stripeSubscription(customerId);
    subscriptions.set(subscription.id, subscription);
    const { payload, signature } = signed(
      "customer.subscription.created",
      subscription,
      "whsec_other",
    );

    expect((await POST(request(payload, signature))).status).toBe(400);
    const { rowCount } = await db.query("select 1 from public.subscriptions where id = $1", [
      subscription.id,
    ]);
    expect(rowCount).toBe(0);
  });
});
