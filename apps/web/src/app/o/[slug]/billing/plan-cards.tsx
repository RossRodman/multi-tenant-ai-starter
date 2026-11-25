"use client";

import { PLANS, planRank } from "@repo/billing/plans";
import type { BillingInterval, PaidPlanId, PlanId } from "@repo/billing/plans";
import { useState } from "react";

import { SubmitButton } from "@/app/(auth)/auth-ui";
import { buttonVariants } from "@/components/ui/button";
import { money, planFeatures, planPrice } from "@/lib/billing";
import { cn } from "@/lib/utils";

import { openPortalAction, startCheckoutAction } from "./actions";

const PLAN_IDS = ["free", "pro", "team"] as const satisfies readonly PlanId[];
const BUTTON = "h-10 w-full text-[15px] font-semibold";

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 size-4 shrink-0 text-primary"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export function PlanCards({
  slug,
  current,
  currentInterval,
  hasSubscription,
  cancelling,
  canChange,
}: {
  slug: string;
  current: PlanId;
  currentInterval: BillingInterval | null;
  hasSubscription: boolean;
  cancelling: boolean;
  canChange: boolean;
}) {
  const [interval, setInterval] = useState<BillingInterval>(currentInterval ?? "month");

  function button(plan: PlanId) {
    if (!canChange) return null;
    const isCurrent = plan === current;
    if (isCurrent && (plan === "free" || interval === currentInterval)) {
      return (
        <span
          aria-disabled="true"
          className={cn(
            buttonVariants({ variant: "outline" }),
            BUTTON,
            "bg-canvas text-muted-foreground",
          )}
        >
          Current plan
        </span>
      );
    }

    const upgrade = planRank(plan) > planRank(current);
    const label = isCurrent
      ? `Switch to ${interval === "year" ? "yearly" : "monthly"} billing`
      : upgrade
        ? "Upgrade"
        : "Downgrade";
    const variant = upgrade ? "default" : "outline";

    if (plan === "free") {
      if (cancelling) return null;
      return (
        <form action={openPortalAction.bind(null, slug, { kind: "cancel" })}>
          <SubmitButton pendingLabel="Opening..." variant={variant} className={BUTTON}>
            {label}
          </SubmitButton>
        </form>
      );
    }
    const paid: PaidPlanId = plan;
    const action = hasSubscription
      ? openPortalAction.bind(null, slug, { kind: "change", plan: paid, interval })
      : startCheckoutAction.bind(null, slug, paid, interval);
    return (
      <form action={action}>
        <SubmitButton pendingLabel="Opening..." variant={variant} className={BUTTON}>
          {label}
        </SubmitButton>
      </form>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="change-plan">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="change-plan" className="text-base font-bold">
          Change plan
        </h2>
        <div role="group" aria-label="Billing interval" className="flex gap-2">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => {
                setInterval(value);
              }}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-[10px] border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                interval === value
                  ? "border-primary bg-accent font-semibold text-accent-foreground"
                  : "border-input bg-background font-medium",
              )}
            >
              {value === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {PLAN_IDS.map((plan) => {
          const isCurrent = plan === current;
          const price = planPrice(plan, interval);
          return (
            <div
              key={plan}
              className={cn(
                "flex min-w-0 flex-[1_1_12rem] flex-col gap-3.5 rounded-[14px] bg-background p-6",
                isCurrent ? "border-2 border-primary p-[23px]" : "border border-input",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold">{PLANS[plan].name}</h3>
                {isCurrent ? (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                    Current plan
                  </span>
                ) : null}
              </div>
              <div>
                <span className="text-2xl font-bold tracking-tight">
                  {money(price.amount, "usd")}
                </span>
                <span className="text-[13px] text-muted-foreground"> {price.suffix}</span>
              </div>
              <ul className="flex flex-1 flex-col gap-2">
                {planFeatures(plan).map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm leading-snug">
                    <Check />
                    {feature}
                  </li>
                ))}
              </ul>
              {button(plan)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
