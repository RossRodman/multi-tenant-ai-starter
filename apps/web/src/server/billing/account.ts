import "server-only";

import { getBillingAccount } from "@repo/billing";
import type { BillingAccount } from "@repo/billing";

import { findCustomerId } from "./customer";
import { getStripe } from "./stripe";

export async function loadBillingAccount(organizationId: string): Promise<BillingAccount | null> {
  const customerId = await findCustomerId(organizationId);
  if (!customerId) return null;
  return getBillingAccount({ stripe: getStripe(), customerId });
}
