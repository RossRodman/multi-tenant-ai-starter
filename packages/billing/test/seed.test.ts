import { describe, expect, it } from "vitest";

import { seedStripe } from "../src";
import { fakeStripe } from "./helpers";

interface PortalFeatures {
  payment_method_update: { enabled: boolean };
  invoice_history: { enabled: boolean };
  subscription_cancel: { enabled: boolean; mode: string };
  subscription_update: { proration_behavior: string; products: unknown[] };
}

interface Price {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string };
  lookup_key: string | null;
  active: boolean;
  metadata: Record<string, string>;
}

function inMemoryStripe() {
  const products: {
    id: string;
    name: string;
    active: boolean;
    metadata: Record<string, string>;
  }[] = [];
  const prices: Price[] = [];
  const portals: { id: string; metadata: Record<string, string>; features: PortalFeatures }[] = [];
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_${String(++counter)}`;

  const stripe = fakeStripe({
    products: {
      list: () => products.filter(({ active }) => active),
      create: (params: { name: string; metadata: Record<string, string> }) => {
        const product = { id: nextId("prod"), active: true, ...params };
        products.push(product);
        return Promise.resolve(product);
      },
      update: (id: string, params: { name: string }) => {
        const product = products.find((item) => item.id === id);
        if (!product) throw new Error("no product");
        Object.assign(product, params);
        return Promise.resolve(product);
      },
    },
    prices: {
      list: ({ lookup_keys }: { lookup_keys: string[] }) =>
        Promise.resolve({
          data: prices.filter(
            ({ lookup_key, active }) => active && lookup_keys.includes(lookup_key ?? ""),
          ),
        }),
      create: (params: {
        product: string;
        currency: string;
        unit_amount: number;
        recurring: { interval: string };
        lookup_key: string;
        transfer_lookup_key?: boolean;
        metadata: Record<string, string>;
      }) => {
        if (params.transfer_lookup_key) {
          for (const price of prices) {
            if (price.lookup_key === params.lookup_key) price.lookup_key = null;
          }
        }
        const { transfer_lookup_key: _transfer, ...rest } = params;
        const price = { id: nextId("price"), active: true, ...rest };
        prices.push(price);
        return Promise.resolve(price);
      },
      update: (id: string, params: { active: boolean }) => {
        const price = prices.find((item) => item.id === id);
        if (!price) throw new Error("no price");
        Object.assign(price, params);
        return Promise.resolve(price);
      },
    },
    billingPortal: {
      configurations: {
        list: () => portals,
        create: (params: { metadata: Record<string, string>; features: PortalFeatures }) => {
          const portal = { id: nextId("bpc"), ...params };
          portals.push(portal);
          return Promise.resolve(portal);
        },
        update: (id: string, params: { features: unknown; metadata: Record<string, string> }) => {
          const portal = portals.find((item) => item.id === id);
          if (!portal) throw new Error("no portal");
          Object.assign(portal, params);
          return Promise.resolve(portal);
        },
      },
    },
  });
  return { stripe, products, prices, portals };
}

describe("seedStripe", () => {
  it("creates two products, four prices and the portal configuration", async () => {
    const { stripe, products, prices, portals } = inMemoryStripe();

    const report = await seedStripe(stripe);

    expect(report).toEqual({
      products: { pro: "created", team: "created" },
      prices: {
        pro_monthly: "created",
        pro_yearly: "created",
        team_monthly: "created",
        team_yearly: "created",
      },
      portal: "created",
    });
    expect(products.map(({ metadata }) => metadata.plan)).toEqual(["pro", "team"]);
    expect(
      prices.map(({ lookup_key, unit_amount, recurring, currency }) => ({
        lookup_key,
        unit_amount,
        interval: recurring.interval,
        currency,
      })),
    ).toEqual([
      { lookup_key: "pro_monthly", unit_amount: 1900, interval: "month", currency: "usd" },
      { lookup_key: "pro_yearly", unit_amount: 19000, interval: "year", currency: "usd" },
      { lookup_key: "team_monthly", unit_amount: 4900, interval: "month", currency: "usd" },
      { lookup_key: "team_yearly", unit_amount: 49000, interval: "year", currency: "usd" },
    ]);

    const [portal] = portals;
    expect(portal?.metadata.app).toBe("multi-tenant-ai-starter");
    expect(portal?.features.payment_method_update.enabled).toBe(true);
    expect(portal?.features.invoice_history.enabled).toBe(true);
    expect(portal?.features.subscription_cancel).toMatchObject({
      enabled: true,
      mode: "at_period_end",
    });
    expect(portal?.features.subscription_update.proration_behavior).toBe("create_prorations");
    expect(portal?.features.subscription_update.products).toEqual(
      products.map(({ id }) => ({
        product: id,
        prices: prices.filter(({ product }) => product === id).map((price) => price.id),
      })),
    );
  });

  it("changes nothing on a second run", async () => {
    const { stripe, products, prices, portals } = inMemoryStripe();
    await seedStripe(stripe);
    const before = JSON.stringify({ products, prices, portals });

    const report = await seedStripe(stripe);

    expect(report).toEqual({
      products: { pro: "unchanged", team: "unchanged" },
      prices: {
        pro_monthly: "unchanged",
        pro_yearly: "unchanged",
        team_monthly: "unchanged",
        team_yearly: "unchanged",
      },
      portal: "unchanged",
    });
    expect(JSON.stringify({ products, prices, portals })).toBe(before);
  });

  it("moves the lookup key to a new price and archives the old one when an amount changes", async () => {
    const { stripe, prices, portals } = inMemoryStripe();
    await seedStripe(stripe);
    const old = prices.find(({ lookup_key }) => lookup_key === "pro_monthly");
    if (!old) throw new Error("price missing");
    old.unit_amount = 1500;

    const report = await seedStripe(stripe);

    expect(report.prices.pro_monthly).toBe("updated");
    expect(report.prices.pro_yearly).toBe("unchanged");
    const current = prices.find(({ lookup_key }) => lookup_key === "pro_monthly");
    expect(current).toMatchObject({ unit_amount: 1900, active: true });
    expect(current?.id).not.toBe(old.id);
    expect(old).toMatchObject({ active: false, lookup_key: null });
    expect(report.portal).toBe("updated");
    expect(JSON.stringify(portals[0]?.features)).toContain(current?.id);
    expect(JSON.stringify(portals[0]?.features)).not.toContain(old.id);
  });

  it("repairs the portal configuration when it was changed by hand", async () => {
    const { stripe, portals } = inMemoryStripe();
    await seedStripe(stripe);
    const portal = portals[0];
    if (!portal) throw new Error("portal missing");
    portal.features.subscription_cancel.enabled = false;

    expect((await seedStripe(stripe)).portal).toBe("updated");
    expect(portal.features.subscription_cancel.enabled).toBe(true);
  });
});
