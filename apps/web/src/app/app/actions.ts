"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { text } from "@/lib/form";
import { acceptInvitation } from "@/server/invitations";
import { createOrganization, rememberOrganization } from "@/server/organizations";
import { orgCreateLimiter } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import {
  ACCEPT_ERROR_PARAM,
  ACCEPT_ERROR_SEAT_LIMIT,
  ACCEPT_ERROR_UNKNOWN,
  fieldMessages,
} from "./form-state";
import type { OrganizationFormState } from "./form-state";

export async function createOrganizationAction(
  _prev: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const user = await requireUser();
  const values = { name: text(formData, "name"), slug: text(formData, "slug") };
  if (!orgCreateLimiter.hit(user.id).ok) return { error: "rate_limited", values };

  const result = await createOrganization(await getSupabase(), values);
  if (result.ok) {
    revalidatePath("/app");
    redirect(`/app/new/${result.slug}` as Route);
  }

  switch (result.error) {
    case "invalid_name":
      return { fieldErrors: { name: fieldMessages.invalid_name }, values };
    case "invalid_slug":
    case "slug_taken":
      return { fieldErrors: { slug: fieldMessages[result.error] }, values };
    case "unknown":
      return { error: "unknown", values };
  }
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) redirect("/app");

  const result = await acceptInvitation(await getSupabase(), id.data);
  if (result.ok) {
    revalidatePath("/app");
    await rememberOrganization(result.slug);
    redirect(`/o/${result.slug}` as Route);
  }
  const params = new URLSearchParams({ invitation: id.data });
  if (result.error === "unknown") params.set(ACCEPT_ERROR_PARAM, ACCEPT_ERROR_UNKNOWN);
  if (result.error === "seat_limit") params.set(ACCEPT_ERROR_PARAM, ACCEPT_ERROR_SEAT_LIMIT);
  redirect(`/app?${params.toString()}` as Route);
}
