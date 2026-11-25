import { PLANS } from "@repo/billing/plans";
import type { BillingInterval } from "@repo/billing/plans";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { Alert } from "@/components/ui/alert";
import { money } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { canManage } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  completeCheckout,
  getBilling,
  isBillingConfigured,
  loadBillingAccount,
} from "@/server/billing";
import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import { PlanCards } from "./plan-cards";
import { PortalButton } from "./portal-button";
import { billingStatusMessages, isBillingStatus } from "./status";

const CARD = "rounded-[14px] border border-input bg-background";
const PILL = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4"
    >
      <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 4h5v5M16 4l-7 7" />
    </svg>
  );
}

function Th({ children }: { children?: ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-input px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      {children}
    </th>
  );
}

const INVOICE_TONES: Record<string, string> = {
  paid: "bg-success-muted text-success-muted-foreground",
  open: "bg-warning-muted text-warning-muted-foreground",
  uncollectible: "bg-destructive-muted text-destructive-muted-foreground",
  void: "bg-foreground/8 text-foreground/80",
};

const sessionIdSchema = z.string().regex(/^cs_(test|live)_\w+$/);

const cardLabel = (brand: string) => brand.charAt(0).toUpperCase() + brand.slice(1);

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string | string[]; session_id?: string | string[] }>;
}) {
  const user = await requireUser();
  const organization = await currentOrganization(user.id, (await params).slug);
  if (!organization || !canManage(organization.role)) notFound();

  const isOwner = organization.role === "owner";
  const configured = isBillingConfigured();
  const { status, session_id: sessionId } = await searchParams;
  const billingHref = `/o/${organization.slug}/billing` as Route;

  if (sessionId !== undefined) {
    const checkoutSession = sessionIdSchema.safeParse(sessionId);
    if (checkoutSession.success && isOwner && configured) {
      try {
        await completeCheckout(checkoutSession.data, organization);
      } catch (error) {
        console.error("Checkout return failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
    redirect(billingHref);
  }

  const [billing, account] = await Promise.all([
    getBilling(await getSupabase(), organization.id),
    configured
      ? loadBillingAccount(organization.id).catch((error: unknown) => {
          console.error("Billing account failed", {
            error: error instanceof Error ? error.message : "unknown",
          });
          return undefined;
        })
      : null,
  ]);
  const accountFailed = account === undefined;

  const { subscription, plan, seats } = billing;
  const interval = (subscription?.interval ?? null) as BillingInterval | null;
  const pastDue = subscription?.status === "past_due";
  const cancelling = subscription?.cancel_at_period_end === true;
  const failedInvoice = account?.invoices.find((invoice) => invoice.status === "open");
  const card = account?.card
    ? `${cardLabel(account.card.brand)} ending ${account.card.last4}`
    : "your card";
  const notice =
    typeof status === "string" && isBillingStatus(status) ? billingStatusMessages[status] : null;
  const seatPercent =
    seats.limit === null ? 0 : Math.min(100, Math.round((seats.used / seats.limit) * 100));

  const subline = pastDue
    ? `Payment failed${failedInvoice ? ` on ${formatDate(failedInvoice.date)}` : ""} · we will retry automatically`
    : subscription?.current_period_end
      ? `${cancelling ? "Ends" : "Renews"} on ${formatDate(subscription.current_period_end)} · billed ${interval === "year" ? "yearly" : "monthly"}`
      : "No subscription. Upgrade to raise your limits.";

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      {pastDue ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-xl border border-destructive-border bg-destructive-muted px-5 py-4 text-destructive-muted-foreground"
        >
          <div className="flex-[1_1_20rem]">
            <div className="text-[15px] font-bold">Your last payment failed</div>
            <div className="mt-0.5 text-sm leading-normal">
              We could not charge {card}
              {failedInvoice ? ` on ${formatDate(failedInvoice.date)}` : ""}.{" "}
              {isOwner
                ? "Update your payment method to keep your plan."
                : "Ask an owner to update the payment method to keep your plan."}{" "}
              Access continues while we retry.
            </div>
          </div>
          {isOwner && configured ? (
            <PortalButton
              slug={organization.slug}
              intent={{ kind: "payment_method" }}
              variant="default"
            >
              Update payment method
            </PortalButton>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">Subscription and invoices for {organization.name}.</p>
      </div>

      {notice ? <Alert variant="destructive">{notice}</Alert> : null}
      {!configured ? (
        <Alert variant="destructive">
          Billing is not configured.{" "}
          {isOwner ? "Set the Stripe and Supabase secret keys to enable it." : "Ask an owner."}
        </Alert>
      ) : null}
      {accountFailed ? (
        <Alert variant="destructive">Invoices and payment details could not be loaded.</Alert>
      ) : null}
      {!isOwner ? (
        <p className="text-sm text-muted-foreground">
          Only owners can change the plan or payment details.
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_32rem] flex-col gap-4">
          <section className={cn(CARD, "flex flex-col gap-4 p-6")} aria-label="Current plan">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-[13px] font-medium text-muted-foreground">Current plan</div>
                <div className="flex items-center gap-3">
                  <span className="text-[1.625rem] font-bold tracking-tight">
                    {PLANS[plan].name}
                  </span>
                  {pastDue ? (
                    <span className={cn(PILL, "bg-warning-muted text-warning-muted-foreground")}>
                      Past due
                    </span>
                  ) : cancelling && subscription.current_period_end ? (
                    <span className={cn(PILL, "bg-warning-muted text-warning-muted-foreground")}>
                      Cancels on {formatDate(subscription.current_period_end)}
                    </span>
                  ) : subscription ? (
                    <span className={cn(PILL, "bg-success-muted text-success-muted-foreground")}>
                      {subscription.status === "trialing" ? "Trial" : "Active"}
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground">{subline}</div>
              </div>
              {isOwner && configured && account ? (
                <PortalButton slug={organization.slug} intent={{ kind: "manage" }}>
                  Manage in Stripe
                  <ExternalIcon />
                </PortalButton>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 border-t border-input pt-4">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">Seats</span>
                <span className="text-muted-foreground">
                  {seats.limit === null
                    ? `${String(seats.used)} used · unlimited`
                    : `${String(seats.used)} of ${String(seats.limit)} used`}
                </span>
              </div>
              {seats.limit !== null ? (
                <div
                  role="progressbar"
                  aria-label="Seats used"
                  aria-valuemin={0}
                  aria-valuemax={seats.limit}
                  aria-valuenow={Math.min(seats.used, seats.limit)}
                  className="h-2 overflow-hidden rounded bg-foreground/10"
                >
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${String(seatPercent)}%` }}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <PlanCards
            slug={organization.slug}
            current={plan}
            currentInterval={interval}
            hasSubscription={subscription !== null}
            cancelling={cancelling}
            canChange={isOwner && configured}
          />

          <section className={cn(CARD, "flex flex-col gap-4 p-6")} aria-labelledby="invoices">
            <h2 id="invoices" className="text-base font-bold">
              Invoices
            </h2>
            {account && account.invoices.length > 0 ? (
              <div className="-mx-6 overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-sm">
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Amount</Th>
                      <Th>Status</Th>
                      <Th>
                        <span className="sr-only">Download</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-input last:border-b-0">
                        <td className="px-4 py-3">{formatDate(invoice.date)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {money(invoice.amount, invoice.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              PILL,
                              INVOICE_TONES[invoice.status] ?? INVOICE_TONES.void,
                            )}
                          >
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {invoice.pdfUrl ? (
                            <a
                              href={invoice.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[13px] font-semibold text-ring underline-offset-4 hover:underline"
                            >
                              Download PDF
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-4">
          <section className={cn(CARD, "flex flex-col gap-3 p-6")} aria-labelledby="payment-method">
            <h2 id="payment-method" className="text-base font-bold">
              Payment method
            </h2>
            {account?.card ? (
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-semibold">
                  {cardLabel(account.card.brand)} ending {account.card.last4}
                </span>
                <span className="text-muted-foreground">
                  Expires {String(account.card.expMonth).padStart(2, "0")}/
                  {String(account.card.expYear).slice(-2)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payment method on file.</p>
            )}
            {isOwner && configured && account ? (
              <PortalButton slug={organization.slug} intent={{ kind: "payment_method" }}>
                Update payment method
              </PortalButton>
            ) : null}
          </section>

          <section className={cn(CARD, "flex flex-col gap-3 p-6")} aria-labelledby="billing-email">
            <h2 id="billing-email" className="text-base font-bold">
              Billing email
            </h2>
            {account?.email ? (
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-semibold break-all">{account.email}</span>
                <span className="text-muted-foreground">Invoices and receipts are sent here.</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No billing email yet.</p>
            )}
            {isOwner && configured && account ? (
              <PortalButton slug={organization.slug} intent={{ kind: "manage" }}>
                Change email
              </PortalButton>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
