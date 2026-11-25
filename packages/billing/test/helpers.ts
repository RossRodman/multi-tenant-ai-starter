import { createServiceClient } from "@repo/db";
import pg from "pg";
import Stripe from "stripe";

import { env } from "./env";

export const db = createServiceClient({ url: env.url, secretKey: env.secretKey });
export const pgClient = new pg.Client({ connectionString: env.dbUrl });

export const WEBHOOK_SECRET = "whsec_test_secret";

const signer = new Stripe("sk_test_signer");

export const unique = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

export async function createOrganization() {
  const created = await db.auth.admin.createUser({
    email: `${unique("billing")}@example.com`,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  await pgClient.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  const slug = unique("billing").replaceAll("_", "-");
  const { rows } = await pgClient.query<{ id: string }>(
    "insert into public.organizations (name, slug) values ($1, $2) returning id",
    [`Org ${slug}`, slug],
  );
  await pgClient.query("select set_config('request.jwt.claim.sub', '', false)");

  const id = rows[0]?.id;
  if (!id) throw new Error("organization not created");
  return { id, userId };
}

export async function cleanUp(organizations: { id: string; userId: string }[]) {
  await pgClient.query("delete from public.organizations where id = any ($1)", [
    organizations.map(({ id }) => id),
  ]);
  for (const { userId } of organizations) await db.auth.admin.deleteUser(userId);
}

export async function linkCustomer(organizationId: string) {
  const customerId = unique("cus");
  const { error } = await db.rpc("link_billing_customer", {
    organization_id: organizationId,
    stripe_customer_id: customerId,
  });
  if (error) throw error;
  return customerId;
}

export async function subscriptionRows(organizationId: string) {
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return data;
}

interface SubscriptionFixture {
  id?: string;
  customer: string;
  status?: Stripe.Subscription.Status;
  lookupKey?: string | null;
  metadataLookupKey?: string;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: number | null;
  canceledAt?: number | null;
}

export function stripeSubscription({
  id = unique("sub"),
  customer,
  status = "active",
  lookupKey = "pro_monthly",
  metadataLookupKey,
  periodEnd = 1_800_000_000,
  cancelAtPeriodEnd = false,
  cancelAt = null,
  canceledAt = null,
}: SubscriptionFixture) {
  return {
    id,
    object: "subscription",
    customer,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: cancelAt,
    canceled_at: canceledAt,
    items: {
      data: [
        {
          id: unique("si"),
          current_period_end: periodEnd,
          price: {
            id: unique("price"),
            lookup_key: lookupKey,
            metadata: metadataLookupKey ? { lookup_key: metadataLookupKey } : {},
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

export function signedEvent(
  type: string,
  object: object,
  { timestamp, secret = WEBHOOK_SECRET }: { timestamp?: number; secret?: string } = {},
) {
  const payload = JSON.stringify({
    id: unique("evt"),
    object: "event",
    type,
    data: { object },
  });
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return { payload, signature };
}

export function fakeStripe(parts: object) {
  return { webhooks: signer.webhooks, ...parts } as unknown as Stripe;
}
