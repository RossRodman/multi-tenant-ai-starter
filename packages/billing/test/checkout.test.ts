import { describe, expect, it, vi } from "vitest";

import { createCheckoutSession, createPortalSession, planChangeFlow } from "../src";
import { fakeStripe } from "./helpers";

const urls = {
  success: "https://app.test/o/acme/billing",
  cancel: "https://app.test/o/acme/billing",
};

function stripeWith({
  subscriptions = [],
  prices = { pro_monthly: "price_pro_m", team_yearly: "price_team_y" },
}: {
  subscriptions?: { id?: string; status: string }[];
  prices?: Record<string, string>;
} = {}) {
  const create = vi.fn((_params: object, _options: object) =>
    Promise.resolve({ url: "https://checkout.stripe.test/s" }),
  );
  const openSessions: { id: string; metadata: Record<string, string> }[] = [];
  const expire = vi.fn((_id: string) => Promise.resolve({}));
  const priceList = vi.fn(({ lookup_keys }: { lookup_keys: string[] }) => {
    const id = prices[lookup_keys[0] ?? ""];
    return Promise.resolve({ data: id ? [{ id }] : [] });
  });
  const portalCreate = vi.fn(() => Promise.resolve({ url: "https://portal.stripe.test/p" }));
  const configurations: { id: string; metadata: Record<string, string> }[] = [
    { id: "bpc_other", metadata: { app: "something-else" } },
    { id: "bpc_ours", metadata: { app: "multi-tenant-ai-starter" } },
  ];
  const portalList = vi.fn(() => configurations);

  const cancel = vi.fn((_id: string) => Promise.resolve({}));
  const stripe = fakeStripe({
    subscriptions: {
      list: vi.fn(() => Promise.resolve({ data: subscriptions })),
      cancel,
      retrieve: vi.fn(() => Promise.resolve({ id: "sub_1", items: { data: [{ id: "si_1" }] } })),
    },
    prices: { list: priceList },
    checkout: { sessions: { create, expire, list: vi.fn(() => openSessions) } },
    billingPortal: {
      sessions: { create: portalCreate },
      configurations: { list: portalList },
    },
  });
  return {
    stripe,
    cancel,
    create,
    expire,
    openSessions,
    priceList,
    portalCreate,
    portalList,
    configurations,
  };
}

const base = {
  customerId: "cus_1",
  organizationId: "org-1",
  plan: "pro",
  interval: "month",
} as const;

describe("createCheckoutSession", () => {
  it("creates a subscription session for the stored price", async () => {
    const { stripe, create, priceList } = stripeWith();

    const result = await createCheckoutSession({ stripe, ...base, urls });

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.test/s" });
    expect(priceList).toHaveBeenCalledWith({ lookup_keys: ["pro_monthly"], active: true });
    expect(create).toHaveBeenCalledWith({
      mode: "subscription",
      customer: "cus_1",
      client_reference_id: "org-1",
      line_items: [{ price: "price_pro_m", quantity: 1 }],
      subscription_data: { metadata: { organization_id: "org-1" } },
      success_url: "https://app.test/o/acme/billing?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: urls.cancel,
    });
  });

  it("expires the other open sessions of the customer", async () => {
    const { stripe, expire, openSessions } = stripeWith();
    openSessions.push({ id: "cs_a", metadata: {} }, { id: "cs_b", metadata: {} });

    await createCheckoutSession({ stripe, ...base, urls });

    expect(expire.mock.calls.map(([id]) => id)).toEqual(["cs_a", "cs_b"]);
  });

  it("does not touch sessions when the customer is already subscribed", async () => {
    const { stripe, expire, openSessions } = stripeWith({ subscriptions: [{ status: "active" }] });
    openSessions.push({ id: "cs_open", metadata: {} });
    await createCheckoutSession({ stripe, ...base, urls });
    expect(expire).not.toHaveBeenCalled();
  });

  it("picks the yearly team price", async () => {
    const { stripe, create } = stripeWith();
    await createCheckoutSession({ stripe, ...base, plan: "team", interval: "year", urls });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_team_y", quantity: 1 }] }),
    );
  });

  it.each(["active", "trialing", "past_due", "unpaid", "paused"])(
    "refuses when the customer has a %s subscription",
    async (status) => {
      const { stripe, create } = stripeWith({ subscriptions: [{ status }] });
      expect(await createCheckoutSession({ stripe, ...base, urls })).toEqual({
        ok: false,
        error: "already_subscribed",
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(["canceled", "incomplete_expired"])(
    "allows a customer whose subscription is %s",
    async (status) => {
      const { stripe, cancel } = stripeWith({ subscriptions: [{ status }] });
      expect(await createCheckoutSession({ stripe, ...base, urls })).toMatchObject({ ok: true });
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it("cancels an incomplete subscription before a new Checkout", async () => {
    const { stripe, cancel, create } = stripeWith({
      subscriptions: [{ id: "sub_incomplete", status: "incomplete" }],
    });
    expect(await createCheckoutSession({ stripe, ...base, urls })).toMatchObject({ ok: true });
    expect(cancel).toHaveBeenCalledWith("sub_incomplete");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("leaves an incomplete subscription alone when another one is active", async () => {
    const { stripe, cancel } = stripeWith({
      subscriptions: [
        { id: "sub_incomplete", status: "incomplete" },
        { id: "sub_active", status: "active" },
      ],
    });
    expect(await createCheckoutSession({ stripe, ...base, urls })).toEqual({
      ok: false,
      error: "already_subscribed",
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("fails when the price has not been seeded", async () => {
    const { stripe } = stripeWith({ prices: {} });
    await expect(createCheckoutSession({ stripe, ...base, urls })).rejects.toThrow(/stripe:seed/);
  });
});

describe("createPortalSession", () => {
  const returnUrl = "https://app.test/o/acme/billing";

  it("uses the configuration made by the seed and caches it", async () => {
    const { stripe, portalCreate, portalList } = stripeWith();

    const url = await createPortalSession({ stripe, customerId: "cus_1", returnUrl });
    await createPortalSession({ stripe, customerId: "cus_1", returnUrl });

    expect(url).toBe("https://portal.stripe.test/p");
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      configuration: "bpc_ours",
      return_url: returnUrl,
    });
    expect(portalList).toHaveBeenCalledTimes(1);
  });

  it("fails when the seed has not run", async () => {
    const { stripe, configurations } = stripeWith();
    configurations.splice(1);
    await expect(createPortalSession({ stripe, customerId: "cus_1", returnUrl })).rejects.toThrow(
      /stripe:seed/,
    );
  });

  it("opens the plan change confirmation for a subscription item and price", async () => {
    const { stripe, portalCreate } = stripeWith();

    await createPortalSession({
      stripe,
      customerId: "cus_1",
      returnUrl,
      flow: {
        type: "subscription_update_confirm",
        subscriptionId: "sub_1",
        itemId: "si_1",
        priceId: "price_team_y",
      },
    });

    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: {
          type: "subscription_update_confirm",
          after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
          subscription_update_confirm: {
            subscription: "sub_1",
            items: [{ id: "si_1", price: "price_team_y", quantity: 1 }],
          },
        },
      }),
    );
  });

  it("opens the cancel flow", async () => {
    const { stripe, portalCreate } = stripeWith();
    await createPortalSession({
      stripe,
      customerId: "cus_1",
      returnUrl,
      flow: { type: "subscription_cancel", subscriptionId: "sub_1" },
    });
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: expect.objectContaining({
          type: "subscription_cancel",
          subscription_cancel: { subscription: "sub_1" },
        }) as unknown,
      }),
    );
  });

  it("opens the payment method flow", async () => {
    const { stripe, portalCreate } = stripeWith();
    await createPortalSession({
      stripe,
      customerId: "cus_1",
      returnUrl,
      flow: { type: "payment_method_update" },
    });
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: {
          type: "payment_method_update",
          after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
        },
      }),
    );
  });
});

describe("planChangeFlow", () => {
  it("resolves the item of the subscription and the target price", async () => {
    const { stripe } = stripeWith();
    expect(
      await planChangeFlow({ stripe, subscriptionId: "sub_1", plan: "team", interval: "year" }),
    ).toEqual({
      type: "subscription_update_confirm",
      subscriptionId: "sub_1",
      itemId: "si_1",
      priceId: "price_team_y",
    });
  });
});
