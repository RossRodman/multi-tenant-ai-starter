import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";

import { createOrganization } from "../src/server/organizations";
import { env } from "./env";
import { service, signer, stripeSubscription, stubBillingEnv } from "./billing-helpers";
import { createAdminClient, createUser } from "./harness";

stubBillingEnv();
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");

const customersByKey = new Map<string, string>();
const customersCreate = vi.fn(async (_params: object, options: { idempotencyKey: string }) => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  const id = customersByKey.get(options.idempotencyKey) ?? `cus_${crypto.randomUUID()}`;
  customersByKey.set(options.idempotencyKey, id);
  return { id };
});
const customersUpdate = vi.fn((id: string, _params: object) => Promise.resolve({ id }));
const sessions = new Map<string, object>();
const expired: string[] = [];
const checkoutCreate = vi.fn((_params: { success_url: string; cancel_url: string }) =>
  Promise.resolve({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" }),
);
const subscriptions = new Map<string, object>();
let customerSubscriptions: { id: string; status: string }[] = [];
const subscriptionCancel = vi.fn((id: string) => Promise.resolve({ id }));
const portalCreate = vi.fn((_params: { return_url: string }) =>
  Promise.resolve({ url: "https://portal.stripe.test/p" }),
);

vi.mock("@/server/billing/stripe", () => ({
  getStripe: () => ({
    webhooks: signer.webhooks,
    customers: { create: customersCreate, update: customersUpdate },
    checkout: {
      sessions: {
        retrieve: (id: string) => Promise.resolve(sessions.get(id)),
        create: checkoutCreate,
        list: () => [
          { id: "cs_ok", metadata: {} },
          { id: "cs_stale", metadata: {} },
        ],
        expire: (id: string) => {
          expired.push(id);
          return Promise.resolve({});
        },
      },
    },
    subscriptions: {
      retrieve: (id: string) => Promise.resolve(subscriptions.get(id)),
      list: () => Promise.resolve({ data: customerSubscriptions }),
      cancel: subscriptionCancel,
    },
    prices: { list: () => Promise.resolve({ data: [{ id: "price_1" }] }) },
    billingPortal: {
      sessions: { create: portalCreate },
      configurations: {
        list: () => [{ id: "bpc_ours", metadata: { app: "multi-tenant-ai-starter" } }],
      },
    },
  }),
  isBillingConfigured: () => true,
}));

const { ensureCustomer, findCustomerId } = await import("../src/server/billing/customer");
const { completeCheckout, startCheckout, startPortal } =
  await import("../src/server/billing/flows");
const { getBilling } = await import("../src/server/billing/overview");

const db = new pg.Client({ connectionString: env.dbUrl });
const users: { id: string }[] = [];
const orgIds: string[] = [];

async function newOrganization(label: string) {
  const user = await createUser(label);
  users.push(user);
  const slug = `flows-${crypto.randomUUID().slice(0, 8)}`;
  await createOrganization(user.client, { name: "Flows", slug });
  const { rows } = await db.query<{ id: string }>(
    "select id from public.organizations where slug = $1",
    [slug],
  );
  const id = rows[0]?.id ?? "";
  orgIds.push(id);
  return { user, organization: { id, name: "Flows", slug } };
}

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.query("delete from public.organizations where id = any ($1)", [orgIds]);
  for (const { id } of users) await createAdminClient().auth.admin.deleteUser(id);
  await db.end();
});

describe("ensureCustomer", () => {
  it("ends with one mapping under parallel calls", async () => {
    const { user, organization } = await newOrganization("flows-customer");

    const ids = await Promise.all([
      ensureCustomer(organization, user),
      ensureCustomer(organization, user),
      ensureCustomer(organization, user),
    ]);

    expect(new Set(ids).size).toBe(1);
    const { rows } = await db.query(
      "select 1 from private.billing_customers where organization_id = $1",
      [organization.id],
    );
    expect(rows).toHaveLength(1);
    expect(await findCustomerId(organization.id)).toBe(ids[0]);
  });

  it("keeps the idempotent create free of details that can change", async () => {
    const { user, organization } = await newOrganization("flows-customer-details");
    customersCreate.mockClear();
    customersUpdate.mockClear();

    const id = await ensureCustomer(organization, user);

    expect(customersCreate).toHaveBeenCalledWith(
      { metadata: { organization_id: organization.id } },
      { idempotencyKey: `customer-${organization.id}` },
    );
    expect(customersUpdate).toHaveBeenCalledWith(id, { name: "Flows", email: user.email });
  });
});

describe("startCheckout", () => {
  beforeEach(() => {
    checkoutCreate.mockClear();
    customerSubscriptions = [];
  });

  it("builds the Checkout URLs from the app URL", async () => {
    const { user, organization } = await newOrganization("flows-urls");
    await startCheckout(organization, user, "pro", "month");

    const base = `https://app.test/o/${organization.slug}/billing`;
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: `${base}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: base,
      }),
    );
  });

  it("opens the Portal for an organization that is already subscribed", async () => {
    const { user, organization } = await newOrganization("flows-subscribed");
    customerSubscriptions = [{ id: "sub_live", status: "active" }];
    portalCreate.mockClear();

    expect(await startCheckout(organization, user, "pro", "month")).toBe(
      "https://portal.stripe.test/p",
    );
    expect(checkoutCreate).not.toHaveBeenCalled();

    customerSubscriptions = [];
    expect(await startCheckout(organization, user, "team", "month")).toBe(
      "https://checkout.stripe.test/cs_new",
    );
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it("cancels an incomplete subscription and starts a new Checkout", async () => {
    const { user, organization } = await newOrganization("flows-incomplete");
    customerSubscriptions = [{ id: "sub_incomplete", status: "incomplete" }];
    subscriptionCancel.mockClear();

    expect(await startCheckout(organization, user, "pro", "month")).toBe(
      "https://checkout.stripe.test/cs_new",
    );
    expect(subscriptionCancel).toHaveBeenCalledWith("sub_incomplete");
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });
});

describe("startPortal", () => {
  it("returns to the billing page of the app URL", async () => {
    const { organization } = await newOrganization("flows-portal");
    await service.rpc("link_billing_customer", {
      organization_id: organization.id,
      stripe_customer_id: `cus_${crypto.randomUUID().replaceAll("-", "")}`,
    });
    portalCreate.mockClear();

    expect(await startPortal(organization, { kind: "manage" }, null)).toBe(
      "https://portal.stripe.test/p",
    );
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ return_url: `https://app.test/o/${organization.slug}/billing` }),
    );
  });
});

describe("completeCheckout", () => {
  it("syncs the subscription of a session that belongs to the organization", async () => {
    const { organization } = await newOrganization("flows-complete");
    const customerId = `cus_${crypto.randomUUID().replaceAll("-", "")}`;
    await service.rpc("link_billing_customer", {
      organization_id: organization.id,
      stripe_customer_id: customerId,
    });
    const subscription = stripeSubscription(customerId, "pro_yearly");
    subscriptions.set(subscription.id, subscription);
    sessions.set("cs_ok", { customer: customerId, subscription: subscription.id });

    expired.length = 0;
    expect(await completeCheckout("cs_ok", organization)).toBe(true);
    expect(expired).toEqual(["cs_stale"]);

    const { rows } = await db.query<{ plan: string; interval: string }>(
      "select plan, interval from public.subscriptions where id = $1",
      [subscription.id],
    );
    expect(rows).toEqual([{ plan: "pro", interval: "year" }]);
  });

  it("refuses a session of another customer", async () => {
    const { organization } = await newOrganization("flows-mine");
    const mine = `cus_${crypto.randomUUID().replaceAll("-", "")}`;
    await service.rpc("link_billing_customer", {
      organization_id: organization.id,
      stripe_customer_id: mine,
    });
    const foreign = stripeSubscription("cus_someone_else");
    subscriptions.set(foreign.id, foreign);
    sessions.set("cs_foreign", { customer: "cus_someone_else", subscription: foreign.id });

    expect(await completeCheckout("cs_foreign", organization)).toBe(false);
    const { rowCount } = await db.query("select 1 from public.subscriptions where id = $1", [
      foreign.id,
    ]);
    expect(rowCount).toBe(0);
  });

  it("refuses when the organization has no customer", async () => {
    const { organization } = await newOrganization("flows-none");
    sessions.set("cs_none", { customer: "cus_x", subscription: "sub_x" });
    expect(await completeCheckout("cs_none", organization)).toBe(false);
  });
});

describe("getBilling", () => {
  it("is free with the seats in use", async () => {
    const { user, organization } = await newOrganization("flows-free");

    const billing = await getBilling(user.client, organization.id);

    expect(billing).toMatchObject({
      plan: "free",
      subscription: null,
      seats: { used: 1, members: 1, pending: 0, limit: 3 },
    });
  });

  it("follows the best paid subscription and counts pending invitations", async () => {
    const { user, organization } = await newOrganization("flows-paid");
    await db.query(
      `insert into public.subscriptions (id, organization_id, plan, interval, status) values
         ($1, $3, 'pro', 'month', 'canceled'),
         ($2, $3, 'team', 'year', 'past_due')`,
      [`sub_a${organization.id}`, `sub_b${organization.id}`, organization.id],
    );
    await user.client.from("invitations").insert({
      organization_id: organization.id,
      email: `pending-${crypto.randomUUID()}@example.com`,
      role: "member",
    });

    const billing = await getBilling(user.client, organization.id);

    expect(billing.plan).toBe("team");
    expect(billing.subscription?.interval).toBe("year");
    expect(billing.seats).toMatchObject({ used: 2, pending: 1, limit: null });
  });
});
