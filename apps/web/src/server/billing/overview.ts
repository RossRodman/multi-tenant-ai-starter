import "server-only";

import { PLANS, isPaidStatus, planRank } from "@repo/billing";
import type { PlanId } from "@repo/billing";
import type { Client, Subscription } from "@repo/db";

export interface Seats {
  used: number;
  members: number;
  pending: number;
  limit: number | null;
}

export interface Billing {
  plan: PlanId;
  subscription: Subscription | null;
  seats: Seats;
}

const isPlan = (value: string): value is PlanId => Object.hasOwn(PLANS, value);

async function countSeats(client: Client, organizationId: string) {
  const [members, invitations] = await Promise.all([
    client
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    client
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  if (members.error) throw new Error("Could not count members", { cause: members.error });
  if (invitations.error) {
    throw new Error("Could not count invitations", { cause: invitations.error });
  }
  return {
    used: (members.count ?? 0) + (invitations.count ?? 0),
    members: members.count ?? 0,
    pending: invitations.count ?? 0,
  };
}

export async function getBilling(client: Client, organizationId: string): Promise<Billing> {
  const [subscriptions, counts] = await Promise.all([
    client.from("subscriptions").select("*").eq("organization_id", organizationId),
    countSeats(client, organizationId),
  ]);
  if (subscriptions.error) {
    throw new Error("Could not load the subscription", { cause: subscriptions.error });
  }

  const subscription =
    subscriptions.data
      .filter(
        (row): row is Subscription & { plan: PlanId } =>
          isPlan(row.plan) && isPaidStatus(row.status),
      )
      .sort((a, b) => planRank(b.plan) - planRank(a.plan))[0] ?? null;
  const plan: PlanId = subscription?.plan ?? "free";

  return { plan, subscription, seats: { ...counts, limit: PLANS[plan].seats } };
}
