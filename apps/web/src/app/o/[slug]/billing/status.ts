export type BillingStatus = "forbidden" | "not_configured" | "unknown" | "no_subscription";

export const billingStatusMessages: Record<BillingStatus, string> = {
  forbidden: "Only owners can change billing.",
  not_configured: "Billing is not configured.",
  unknown: "Something went wrong. Try again.",
  no_subscription: "This organization has no subscription to change.",
};

export function isBillingStatus(value: string | undefined): value is BillingStatus {
  return value !== undefined && Object.hasOwn(billingStatusMessages, value);
}
