import { describe, expect, it } from "vitest";

import { toSubscriptionRow } from "../src";
import { stripeSubscription } from "./helpers";

describe("toSubscriptionRow", () => {
  it("maps a Stripe subscription", () => {
    const subscription = stripeSubscription({
      id: "sub_1",
      customer: "cus_1",
      status: "trialing",
      lookupKey: "team_yearly",
      periodEnd: 1_800_000_000,
      cancelAtPeriodEnd: true,
      canceledAt: 1_790_000_000,
    });

    expect(toSubscriptionRow(subscription, "org-1")).toEqual({
      id: "sub_1",
      organization_id: "org-1",
      plan: "team",
      interval: "year",
      status: "trialing",
      current_period_end: "2027-01-15T08:00:00.000Z",
      cancel_at_period_end: true,
      canceled_at: "2026-09-21T14:13:20.000Z",
    });
  });

  it("treats a cancel scheduled by the Customer Portal as cancelling", () => {
    const subscription = stripeSubscription({
      customer: "cus_1",
      periodEnd: 1_800_000_000,
      cancelAt: 1_800_000_000,
      canceledAt: 1_790_000_000,
    });
    expect(toSubscriptionRow(subscription, "org-1")).toMatchObject({
      status: "active",
      cancel_at_period_end: true,
    });
  });

  it("is not cancelling without a scheduled cancel", () => {
    const subscription = stripeSubscription({ customer: "cus_1" });
    expect(toSubscriptionRow(subscription, "org-1")).toMatchObject({
      cancel_at_period_end: false,
    });
  });

  it("falls back to the lookup key kept in the price metadata", () => {
    const subscription = stripeSubscription({
      customer: "cus_1",
      lookupKey: null,
      metadataLookupKey: "pro_yearly",
    });
    expect(toSubscriptionRow(subscription, "org-1")).toMatchObject({
      plan: "pro",
      interval: "year",
    });
  });

  it("throws for an unknown price", () => {
    const subscription = stripeSubscription({ customer: "cus_1", lookupKey: "gold_monthly" });
    expect(() => toSubscriptionRow(subscription, "org-1")).toThrow(/no known price/);
  });

  it("throws for a price without a lookup key", () => {
    const subscription = stripeSubscription({ customer: "cus_1", lookupKey: null });
    expect(() => toSubscriptionRow(subscription, "org-1")).toThrow(/no known price/);
  });
});
