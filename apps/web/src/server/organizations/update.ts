import "server-only";

import type { Client } from "@repo/db";

import { INSUFFICIENT_PRIVILEGE, UNIQUE_VIOLATION } from "../pg-errors";
import { nameSchema, slugSchema } from "./schemas";

export type UpdateOrganizationError =
  "invalid_name" | "invalid_slug" | "slug_taken" | "forbidden" | "unknown";

type UpdateOrganizationResult =
  { ok: true; slug: string } | { ok: false; error: UpdateOrganizationError };

export async function updateOrganization(
  client: Client,
  id: string,
  change: { name: string } | { slug: string },
): Promise<UpdateOrganizationResult> {
  let values: { name: string } | { slug: string };
  if ("name" in change) {
    const name = nameSchema.safeParse(change.name);
    if (!name.success) return { ok: false, error: "invalid_name" };
    values = { name: name.data };
  } else {
    const slug = slugSchema.safeParse(change.slug);
    if (!slug.success || slug.data === "") return { ok: false, error: "invalid_slug" };
    values = { slug: slug.data };
  }

  const { data, error } = await client
    .from("organizations")
    .update(values)
    .eq("id", id)
    .select("slug");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, error: "slug_taken" };
    if (error.code === INSUFFICIENT_PRIVILEGE) return { ok: false, error: "forbidden" };
    console.error("Unexpected organization error", { code: error.code, message: error.message });
    return { ok: false, error: "unknown" };
  }

  const row = data[0];
  return row ? { ok: true, slug: row.slug } : { ok: false, error: "forbidden" };
}
