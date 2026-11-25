import { PLANS } from "@repo/billing/plans";
import type { BillingInterval, PaidPlanId, PlanId } from "@repo/billing/plans";

export type PortalIntent =
  | { kind: "manage" }
  | { kind: "cancel" }
  | { kind: "payment_method" }
  | { kind: "change"; plan: PaidPlanId; interval: BillingInterval };

export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

export function planPrice(plan: PlanId, interval: BillingInterval) {
  if (plan === "free") return { amount: 0, suffix: "forever" };
  return {
    amount: PLANS[plan].prices[interval].amount,
    suffix: interval === "month" ? "/ month" : "/ year",
  };
}

export function planFeatures(plan: PlanId) {
  const { seats, aiMessages } = PLANS[plan];
  return [
    seats === null ? "Unlimited seats" : `${String(seats)} seats`,
    `${aiMessages.toLocaleString("en")} AI messages per month`,
  ];
}

export function seatsLeftLabel(left: number) {
  return `${String(left)} ${left === 1 ? "seat" : "seats"} left`;
}

export interface SeatUsage {
  used: number;
  limit: number | null;
}

export const seatsFull = ({ used, limit }: SeatUsage) => limit !== null && used >= limit;
