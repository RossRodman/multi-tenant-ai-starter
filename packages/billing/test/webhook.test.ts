import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type Stripe from "stripe";

import { handleWebhook } from "../src";
import {
  WEBHOOK_SECRET,
  cleanUp,
  createOrganization,
  db,
  fakeStripe,
  linkCustomer,
  pgClient,
  signedEvent,
  stripeSubscription,
  subscriptionRows,
} from "./helpers";

type Organization = Awaited<ReturnType<typeof createOrganization>>;

const organizations: Organization[] = [];
let organization: Organization;
let customerId: string;
let current: Map<string, Stripe.Subscription>;
const retrieve = vi.fn((id: string) => {
  const subscription = current.get(id);
  return subscription ? Promise.resolve(subscription) : Promise.reject(new Error("not found"));
});

const expire = vi.fn((_id: string) => Promise.resolve({}));
const openSessions = vi.fn((): { id: string; metadata: Record<string, string> }[] => []);
const stripe = fakeStripe({
  subscriptions: { retrieve },
  checkout: { sessions: { list: openSessions, expire } },
});

function receive(event: { payload: string; signature: string | null }) {
  return handleWebhook({ stripe, db, ...event, secret: WEBHOOK_SECRET });
}

beforeAll(async () => {
  await pgClient.connect();
});

afterAll(async () => {
  await cleanUp(organizations);
  await pgClient.end();
});

beforeEach(async () => {
  retrieve.mockClear();
  expire.mockClear();
  openSessions.mockReturnValue([]);
  current = new Map();
  organization = await createOrganization();
  organizations.push(organization);
  customerId = await linkCustomer(organization.id);
});

describe("signature", () => {
  it("rejects a payload signed with another secret", async () => {
    const subscription = stripeSubscription({ customer: customerId });
    current.set(subscription.id, subscription);
    const event = signedEvent("customer.subscription.created", subscription, {
      secret: "whsec_other",
    });

    expect(await receive(event)).toEqual({ status: 400 });
    expect(await subscriptionRows(organization.id)).toEqual([]);
  });

  it("rejects a missing signature", async () => {
    const event = signedEvent(
      "customer.subscription.created",
      stripeSubscription({ customer: customerId }),
    );
    expect(await receive({ payload: event.payload, signature: null })).toEqual({ status: 400 });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("rejects a payload changed after signing", async () => {
    const subscription = stripeSubscription({ customer: customerId });
    current.set(subscription.id, subscription);
    const event = signedEvent("customer.subscription.created", subscription);

    expect(await receive({ ...event, payload: `${event.payload} ` })).toEqual({ status: 400 });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp", async () => {
    const subscription = stripeSubscription({ customer: customerId });
    current.set(subscription.id, subscription);
    const event = signedEvent("customer.subscription.created", subscription, {
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });

    expect(await receive(event)).toEqual({ status: 400 });
    expect(await subscriptionRows(organization.id)).toEqual([]);
  });
});

describe("subscription events", () => {
  it.each([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
  ])("mirrors the subscription on %s", async (type) => {
    const subscription = stripeSubscription({
      customer: customerId,
      status: "active",
      lookupKey: "team_yearly",
      periodEnd: 1_800_000_000,
    });
    current.set(subscription.id, subscription);

    expect(await receive(signedEvent(type, subscription))).toEqual({ status: 200 });

    const [row] = await subscriptionRows(organization.id);
    expect(row).toMatchObject({
      id: subscription.id,
      organization_id: organization.id,
      plan: "team",
      interval: "year",
      status: "active",
      cancel_at_period_end: false,
      canceled_at: null,
    });
    expect(new Date(row?.current_period_end ?? "").getTime()).toBe(1_800_000_000_000);
  });

  it("converges after duplicates and out of order delivery", async () => {
    const id = "sub_ordering";
    const first = stripeSubscription({ id, customer: customerId, status: "incomplete" });
    const second = stripeSubscription({ id, customer: customerId, status: "past_due" });
    current.set(id, second);

    await receive(signedEvent("customer.subscription.updated", second));
    await receive(signedEvent("customer.subscription.created", first));
    await receive(signedEvent("customer.subscription.created", first));

    const rows = await subscriptionRows(organization.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, status: "past_due" });
  });

  it("stores a cancellation", async () => {
    const subscription = stripeSubscription({
      customer: customerId,
      status: "canceled",
      cancelAtPeriodEnd: false,
      canceledAt: 1_790_000_000,
    });
    current.set(subscription.id, subscription);

    await receive(signedEvent("customer.subscription.deleted", subscription));

    const [row] = await subscriptionRows(organization.id);
    expect(row?.status).toBe("canceled");
    expect(new Date(row?.canceled_at ?? "").getTime()).toBe(1_790_000_000_000);
  });

  it("takes the organization from the customer, never from metadata", async () => {
    const other = await createOrganization();
    organizations.push(other);
    const subscription = {
      ...stripeSubscription({ customer: customerId }),
      metadata: { organization_id: other.id },
    } as Stripe.Subscription;
    current.set(subscription.id, subscription);

    await receive(signedEvent("customer.subscription.created", subscription));

    expect(await subscriptionRows(organization.id)).toHaveLength(1);
    expect(await subscriptionRows(other.id)).toEqual([]);
  });

  it("ignores an unknown customer", async () => {
    const subscription = stripeSubscription({ customer: "cus_nobody" });
    current.set(subscription.id, subscription);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await receive(signedEvent("customer.subscription.created", subscription))).toEqual({
      status: 200,
    });
    expect(warn).toHaveBeenCalled();
    const { data } = await db.from("subscriptions").select("id").eq("id", subscription.id);
    expect(data).toEqual([]);
    warn.mockRestore();
  });

  it("answers 500 when the sync fails, so Stripe retries", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const event = signedEvent("customer.subscription.updated", { id: "sub_missing" });

    expect(await receive(event)).toEqual({ status: 500 });
    expect(error).toHaveBeenCalledWith(
      "Stripe webhook failed",
      expect.objectContaining({ type: "customer.subscription.updated" }),
    );
    error.mockRestore();
  });

  it("answers 500 for a price it does not know", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const subscription = stripeSubscription({ customer: customerId, lookupKey: "gold_monthly" });
    current.set(subscription.id, subscription);

    expect(await receive(signedEvent("customer.subscription.created", subscription))).toEqual({
      status: 500,
    });
    expect(await subscriptionRows(organization.id)).toEqual([]);
    error.mockRestore();
  });
});

describe("checkout.session.completed", () => {
  it("syncs the subscription of a subscription checkout", async () => {
    const subscription = stripeSubscription({ customer: customerId });
    current.set(subscription.id, subscription);

    const event = signedEvent("checkout.session.completed", {
      id: "cs_1",
      mode: "subscription",
      subscription: subscription.id,
    });
    expect(await receive(event)).toEqual({ status: 200 });
    expect(await subscriptionRows(organization.id)).toHaveLength(1);
  });

  it("expires the other open sessions of the customer, so they cannot be paid twice", async () => {
    const subscription = stripeSubscription({ customer: customerId });
    current.set(subscription.id, subscription);
    openSessions.mockReturnValue([
      { id: "cs_paid", metadata: {} },
      { id: "cs_other", metadata: {} },
    ]);

    await receive(
      signedEvent("checkout.session.completed", {
        id: "cs_paid",
        mode: "subscription",
        customer: customerId,
        subscription: subscription.id,
      }),
    );

    expect(expire.mock.calls.map(([id]) => id)).toEqual(["cs_other"]);
  });

  it("still answers 200 when expiring the other sessions fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const subscription = stripeSubscription({ customer: customerId });
    current.set(subscription.id, subscription);
    openSessions.mockImplementation(() => {
      throw new Error("stripe down");
    });

    const event = signedEvent("checkout.session.completed", {
      id: "cs_paid",
      mode: "subscription",
      customer: customerId,
      subscription: subscription.id,
    });
    expect(await receive(event)).toEqual({ status: 200 });
    error.mockRestore();
  });

  it("converges when a slower sync finishes after a newer one", async () => {
    const id = "sub_race";
    const stale = stripeSubscription({ id, customer: customerId, status: "active" });
    const fresh = stripeSubscription({ id, customer: customerId, status: "past_due" });
    let calls = 0;
    retrieve.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return stale;
      }
      return fresh;
    });

    await Promise.all([
      receive(signedEvent("customer.subscription.updated", stale)),
      new Promise((resolve) => setTimeout(resolve, 30)).then(() =>
        receive(signedEvent("customer.subscription.updated", fresh)),
      ),
    ]);

    expect((await subscriptionRows(organization.id))[0]?.status).toBe("past_due");
  });

  it("ignores other checkout modes", async () => {
    const event = signedEvent("checkout.session.completed", {
      id: "cs_2",
      mode: "payment",
      subscription: null,
    });
    expect(await receive(event)).toEqual({ status: 200 });
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe("other events", () => {
  it("accepts and ignores them", async () => {
    expect(await receive(signedEvent("invoice.paid", { id: "in_1" }))).toEqual({ status: 200 });
    expect(retrieve).not.toHaveBeenCalled();
  });
});
