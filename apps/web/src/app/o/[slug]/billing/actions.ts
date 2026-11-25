"use server";

import { INTERVALS, PAID_PLANS } from "@repo/billing/plans";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isSlug } from "@/lib/slug";
import { getBilling, isBillingConfigured, startCheckout, startPortal } from "@/server/billing";
import { getOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import type { BillingStatus } from "./status";

const planSchema = z.enum(PAID_PLANS);
const intervalSchema = z.enum(INTERVALS);
const intentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manage") }),
  z.object({ kind: z.literal("cancel") }),
  z.object({ kind: z.literal("payment_method") }),
  z.object({ kind: z.literal("change"), plan: planSchema, interval: intervalSchema }),
]);

const billingPath = (slug: string, status?: BillingStatus) =>
  `/o/${slug}/billing${status ? `?status=${status}` : ""}` as Route;

async function owner(slug: string) {
  if (!isSlug(slug)) redirect("/app");
  const user = await requireUser();
  const organization = await getOrganization(await getSupabase(), user.id, slug);
  if (!organization) redirect("/app");
  if (organization.role !== "owner") redirect(billingPath(slug, "forbidden"));
  if (!isBillingConfigured()) redirect(billingPath(slug, "not_configured"));
  return { user, organization };
}

export async function startCheckoutAction(slug: string, plan: string, interval: string) {
  const parsed = z.object({ plan: planSchema, interval: intervalSchema }).safeParse({
    plan,
    interval,
  });
  const { user, organization } = await owner(slug);
  if (!parsed.success || !user.email) redirect(billingPath(slug, "unknown"));

  let url: string;
  try {
    url = await startCheckout(
      organization,
      { email: user.email },
      parsed.data.plan,
      parsed.data.interval,
    );
  } catch (error) {
    console.error("Checkout failed", { error: error instanceof Error ? error.message : "unknown" });
    redirect(billingPath(slug, "unknown"));
  }
  redirect(url as Route);
}

export async function openPortalAction(slug: string, intent: unknown) {
  const parsed = intentSchema.safeParse(intent);
  const { organization } = await owner(slug);
  if (!parsed.success) redirect(billingPath(slug, "unknown"));

  let url: string | null;
  try {
    const { subscription } = await getBilling(await getSupabase(), organization.id);
    url = await startPortal(organization, parsed.data, subscription?.id ?? null);
  } catch (error) {
    console.error("Portal failed", { error: error instanceof Error ? error.message : "unknown" });
    redirect(billingPath(slug, "unknown"));
  }
  redirect(url ? (url as Route) : billingPath(slug, "no_subscription"));
}
