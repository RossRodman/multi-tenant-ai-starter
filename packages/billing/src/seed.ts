import type Stripe from "stripe";

import { PORTAL_APP } from "./checkout";
import { CURRENCY, INTERVALS, PAID_PLANS, PLANS } from "./plans";
import type { BillingInterval, PaidPlanId } from "./plans";

export type SeedAction = "created" | "updated" | "unchanged";

export interface SeedReport {
  products: Record<PaidPlanId, SeedAction>;
  prices: Record<string, SeedAction>;
  portal: SeedAction;
}

async function ensureProduct(stripe: Stripe, plan: PaidPlanId) {
  const name = `${PLANS[plan].name} plan`;
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata.app !== PORTAL_APP || product.metadata.plan !== plan) continue;
    if (product.name === name) return { product, action: "unchanged" as const };
    return {
      product: await stripe.products.update(product.id, { name }),
      action: "updated" as const,
    };
  }
  return {
    product: await stripe.products.create({ name, metadata: { app: PORTAL_APP, plan } }),
    action: "created" as const,
  };
}

async function ensurePrice(
  stripe: Stripe,
  productId: string,
  plan: PaidPlanId,
  interval: BillingInterval,
) {
  const { amount, lookupKey } = PLANS[plan].prices[interval];
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  const current = data[0];
  if (
    current?.unit_amount === amount &&
    current.currency === CURRENCY &&
    current.recurring?.interval === interval &&
    current.product === productId
  ) {
    return { price: current, action: "unchanged" as const };
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: { app: PORTAL_APP, plan, lookup_key: lookupKey },
  });
  if (current) await stripe.prices.update(current.id, { active: false });
  return { price, action: current ? ("updated" as const) : ("created" as const) };
}

function portalFeatures(
  products: { product: string; prices: string[] }[],
): Stripe.BillingPortal.ConfigurationCreateParams["features"] {
  return {
    customer_update: { enabled: true, allowed_updates: ["email", "name"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products,
    },
  };
}

const catalogKey = (products: { product: string; prices: string[] }[]) =>
  products
    .map(({ product, prices }) => `${product}:${[...prices].sort().join(",")}`)
    .sort()
    .join(";");

function portalMatches(
  configuration: Stripe.BillingPortal.Configuration,
  products: { product: string; prices: string[] }[],
) {
  const { features } = configuration;
  return (
    configuration.metadata?.catalog === catalogKey(products) &&
    features.customer_update.enabled &&
    features.invoice_history.enabled &&
    features.payment_method_update.enabled &&
    features.subscription_cancel.enabled &&
    features.subscription_cancel.mode === "at_period_end" &&
    features.subscription_update.enabled &&
    features.subscription_update.proration_behavior === "create_prorations"
  );
}

async function ensurePortal(stripe: Stripe, products: { product: string; prices: string[] }[]) {
  for await (const configuration of stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  })) {
    if (configuration.metadata?.app !== PORTAL_APP) continue;
    if (portalMatches(configuration, products)) return "unchanged" as const;
    await stripe.billingPortal.configurations.update(configuration.id, {
      features: portalFeatures(products),
      metadata: { app: PORTAL_APP, catalog: catalogKey(products) },
    });
    return "updated" as const;
  }
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your subscription" },
    features: portalFeatures(products),
    metadata: { app: PORTAL_APP, catalog: catalogKey(products) },
  });
  return "created" as const;
}

export async function seedStripe(stripe: Stripe): Promise<SeedReport> {
  const report: SeedReport = {
    products: { pro: "unchanged", team: "unchanged" },
    prices: {},
    portal: "unchanged",
  };
  const portalProducts: { product: string; prices: string[] }[] = [];

  for (const plan of PAID_PLANS) {
    const { product, action } = await ensureProduct(stripe, plan);
    report.products[plan] = action;

    const priceIds: string[] = [];
    for (const interval of INTERVALS) {
      const { price, action: priceAction } = await ensurePrice(stripe, product.id, plan, interval);
      report.prices[PLANS[plan].prices[interval].lookupKey] = priceAction;
      priceIds.push(price.id);
    }
    portalProducts.push({ product: product.id, prices: priceIds });
  }

  report.portal = await ensurePortal(stripe, portalProducts);
  return report;
}
