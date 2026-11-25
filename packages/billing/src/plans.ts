export const PLANS = {
  free: { name: "Free", seats: 3, aiMessages: 50, prices: null },
  pro: {
    name: "Pro",
    seats: 10,
    aiMessages: 1000,
    prices: {
      month: { amount: 1900, lookupKey: "pro_monthly" },
      year: { amount: 19000, lookupKey: "pro_yearly" },
    },
  },
  team: {
    name: "Team",
    seats: null,
    aiMessages: 5000,
    prices: {
      month: { amount: 4900, lookupKey: "team_monthly" },
      year: { amount: 49000, lookupKey: "team_yearly" },
    },
  },
} as const;

export const CURRENCY = "usd";

export type PlanId = keyof typeof PLANS;
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";

export const PAID_PLANS = ["pro", "team"] as const satisfies readonly PaidPlanId[];
export const INTERVALS = ["month", "year"] as const satisfies readonly BillingInterval[];
export const PAID_STATUSES = ["active", "trialing", "past_due"] as const;

const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, team: 2 };

export const planRank = (plan: PlanId) => PLAN_RANK[plan];

export const priceFor = (plan: PaidPlanId, interval: BillingInterval) =>
  PLANS[plan].prices[interval];

export function planForLookupKey(
  key: string,
): { plan: PaidPlanId; interval: BillingInterval } | null {
  for (const plan of PAID_PLANS) {
    for (const interval of INTERVALS) {
      if (PLANS[plan].prices[interval].lookupKey === key) return { plan, interval };
    }
  }
  return null;
}

export function isPaidStatus(status: string) {
  return (PAID_STATUSES as readonly string[]).includes(status);
}
