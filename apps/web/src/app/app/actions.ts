"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createOrganization } from "@/server/organizations";
import { orgCreateLimiter } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import { fieldMessages } from "./form-state";
import type { OrganizationFormState } from "./form-state";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

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
    redirect("/app");
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
