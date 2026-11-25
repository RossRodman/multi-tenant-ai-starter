import type Stripe from "stripe";

import { priceFor } from "./plans";
import type { BillingInterval, PaidPlanId } from "./plans";

export const PORTAL_APP = "multi-tenant-ai-starter";

const NON_BLOCKING_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "incomplete",
]);

export type PortalFlow =
  | { type: "subscription_update_confirm"; subscriptionId: string; itemId: string; priceId: string }
  | { type: "subscription_cancel"; subscriptionId: string }
  | { type: "payment_method_update" };

export async function findPrice(
  stripe: Stripe,
  plan: PaidPlanId,
  interval: BillingInterval,
): Promise<Stripe.Price> {
  const { lookupKey } = priceFor(plan, interval);
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  const price = data[0];
  if (!price) throw new Error(`No Stripe price for ${lookupKey}. Run yarn stripe:seed.`);
  return price;
}

export async function expireOpenCheckoutSessions({
  stripe,
  customerId,
  keepSessionId,
}: {
  stripe: Stripe;
  customerId: string;
  keepSessionId?: string;
}) {
  const expiring: Promise<unknown>[] = [];
  for await (const session of stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 100,
  })) {
    if (session.id !== keepSessionId) expiring.push(stripe.checkout.sessions.expire(session.id));
  }
  await Promise.all(expiring);
}

export async function createCheckoutSession({
  stripe,
  customerId,
  organizationId,
  plan,
  interval,
  urls,
}: {
  stripe: Stripe;
  customerId: string;
  organizationId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  urls: { success: string; cancel: string };
}): Promise<{ ok: true; url: string } | { ok: false; error: "already_subscribed" }> {
  const [{ data: existing }, price] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: "all" }),
    findPrice(stripe, plan, interval),
  ]);
  if (existing.some(({ status }) => !NON_BLOCKING_STATUSES.has(status))) {
    return { ok: false, error: "already_subscribed" };
  }

  await Promise.all([
    ...existing
      .filter(({ status }) => status === "incomplete")
      .map(({ id }) => stripe.subscriptions.cancel(id)),
    expireOpenCheckoutSessions({ stripe, customerId }),
  ]);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: organizationId,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: { metadata: { organization_id: organizationId } },
    success_url: `${urls.success}${urls.success.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: urls.cancel,
  });
  if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");
  return { ok: true, url: session.url };
}

const portalConfigurations = new WeakMap<Stripe, string>();

async function portalConfigurationId(stripe: Stripe) {
  const cached = portalConfigurations.get(stripe);
  if (cached) return cached;

  for await (const configuration of stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  })) {
    if (configuration.metadata?.app === PORTAL_APP) {
      portalConfigurations.set(stripe, configuration.id);
      return configuration.id;
    }
  }
  throw new Error("No Stripe Customer Portal configuration. Run yarn stripe:seed.");
}

function flowData(
  flow: PortalFlow,
  returnUrl: string,
): Stripe.BillingPortal.SessionCreateParams.FlowData {
  const after_completion = { type: "redirect", redirect: { return_url: returnUrl } } as const;
  switch (flow.type) {
    case "payment_method_update":
      return { type: flow.type, after_completion };
    case "subscription_cancel":
      return {
        type: flow.type,
        after_completion,
        subscription_cancel: { subscription: flow.subscriptionId },
      };
    case "subscription_update_confirm":
      return {
        type: flow.type,
        after_completion,
        subscription_update_confirm: {
          subscription: flow.subscriptionId,
          items: [{ id: flow.itemId, price: flow.priceId, quantity: 1 }],
        },
      };
  }
}

export async function createPortalSession({
  stripe,
  customerId,
  returnUrl,
  flow,
}: {
  stripe: Stripe;
  customerId: string;
  returnUrl: string;
  flow?: PortalFlow;
}): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    configuration: await portalConfigurationId(stripe),
    return_url: returnUrl,
    ...(flow ? { flow_data: flowData(flow, returnUrl) } : {}),
  });
  return session.url;
}

export async function planChangeFlow({
  stripe,
  subscriptionId,
  plan,
  interval,
}: {
  stripe: Stripe;
  subscriptionId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
}): Promise<PortalFlow> {
  const [subscription, price] = await Promise.all([
    stripe.subscriptions.retrieve(subscriptionId),
    findPrice(stripe, plan, interval),
  ]);
  const item = subscription.items.data[0];
  if (!item) throw new Error(`Subscription ${subscriptionId} has no items`);
  return {
    type: "subscription_update_confirm",
    subscriptionId,
    itemId: item.id,
    priceId: price.id,
  };
}
