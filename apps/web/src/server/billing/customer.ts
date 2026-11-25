import "server-only";

import { getServiceSupabase } from "../supabase/service";
import { getStripe } from "./stripe";

export async function findCustomerId(organizationId: string): Promise<string | null> {
  const { data, error } = await getServiceSupabase().rpc("billing_customer_for_organization", {
    organization_id: organizationId,
  });
  if (error) throw new Error("Could not read the billing customer", { cause: error });
  return data;
}

export async function ensureCustomer(
  organization: { id: string; name: string },
  owner: { email: string },
): Promise<string> {
  const existing = await findCustomerId(organization.id);
  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    { metadata: { organization_id: organization.id } },
    { idempotencyKey: `customer-${organization.id}` },
  );
  await stripe.customers.update(customer.id, { name: organization.name, email: owner.email });

  const { data, error } = await getServiceSupabase().rpc("link_billing_customer", {
    organization_id: organization.id,
    stripe_customer_id: customer.id,
  });
  if (error) throw new Error("Could not save the billing customer", { cause: error });
  return data;
}
