import "server-only";

import {
  createCheckoutSession,
  createPortalSession,
  expireOpenCheckoutSessions,
  planChangeFlow,
  syncSubscription,
} from "@repo/billing";
import type { BillingInterval, PaidPlanId, PortalFlow } from "@repo/billing";

import type { PortalIntent } from "@/lib/billing";

import { getServerEnv } from "../env";
import { getServiceSupabase } from "../supabase/service";
import { ensureCustomer, findCustomerId } from "./customer";
import { getStripe } from "./stripe";

interface OrganizationRef {
  id: string;
  name: string;
  slug: string;
}

const billingUrl = (slug: string) => `${getServerEnv().appUrl}/o/${slug}/billing`;

async function portalFlow(
  intent: PortalIntent,
  subscriptionId: string,
): Promise<PortalFlow | undefined> {
  switch (intent.kind) {
    case "manage":
      return undefined;
    case "payment_method":
      return { type: "payment_method_update" };
    case "cancel":
      return { type: "subscription_cancel", subscriptionId };
    case "change":
      return planChangeFlow({
        stripe: getStripe(),
        subscriptionId,
        plan: intent.plan,
        interval: intent.interval,
      });
  }
}

const needsSubscription = (intent: PortalIntent) =>
  intent.kind === "cancel" || intent.kind === "change";

function openPortal(
  organization: OrganizationRef,
  customerId: string,
  flow: PortalFlow | undefined,
) {
  return createPortalSession({
    stripe: getStripe(),
    customerId,
    returnUrl: billingUrl(organization.slug),
    flow,
  });
}

export async function startPortal(
  organization: OrganizationRef,
  intent: PortalIntent,
  subscriptionId: string | null,
): Promise<string | null> {
  const customerId = await findCustomerId(organization.id);
  if (!customerId) return null;
  if (needsSubscription(intent) && !subscriptionId) return null;
  return openPortal(organization, customerId, await portalFlow(intent, subscriptionId ?? ""));
}

export async function startCheckout(
  organization: OrganizationRef,
  owner: { email: string },
  plan: PaidPlanId,
  interval: BillingInterval,
): Promise<string> {
  const customerId = await ensureCustomer(organization, owner);
  const returnUrl = billingUrl(organization.slug);
  const result = await createCheckoutSession({
    stripe: getStripe(),
    customerId,
    organizationId: organization.id,
    plan,
    interval,
    urls: { success: returnUrl, cancel: returnUrl },
  });
  return result.ok ? result.url : openPortal(organization, customerId, undefined);
}

export async function completeCheckout(
  sessionId: string,
  organization: { id: string },
): Promise<boolean> {
  const stripe = getStripe();
  const [session, customerId] = await Promise.all([
    stripe.checkout.sessions.retrieve(sessionId),
    findCustomerId(organization.id),
  ]);
  const sessionCustomer =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!customerId || sessionCustomer !== customerId || !subscriptionId) return false;

  await syncSubscription({ stripe, db: getServiceSupabase(), subscriptionId });
  await expireOpenCheckoutSessions({ stripe, customerId, keepSessionId: sessionId }).catch(
    (error: unknown) => {
      console.error("Could not expire open Checkout sessions", {
        error: error instanceof Error ? error.message : "unknown",
      });
    },
  );
  return true;
}
