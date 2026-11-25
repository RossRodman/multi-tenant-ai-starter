import "server-only";

import type { Client } from "@repo/db";

import { SLUG_MAX, SLUG_MIN, toSlug } from "@/lib/slug";

import { UNIQUE_VIOLATION } from "../pg-errors";
import { nameSchema, slugSchema } from "./schemas";

export type CreateOrganizationError = "invalid_name" | "invalid_slug" | "slug_taken" | "unknown";

type CreateOrganizationResult =
  { ok: true; slug: string } | { ok: false; error: CreateOrganizationError };

const SUFFIX_LENGTH = 4;
const BASE36_LIMIT = 252;
const ATTEMPTS = 3;
const STEM_MAX = SLUG_MAX - SUFFIX_LENGTH - 1;

function randomSuffix() {
  let suffix = "";
  while (suffix.length < SUFFIX_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH))) {
      if (byte < BASE36_LIMIT && suffix.length < SUFFIX_LENGTH) suffix += (byte % 36).toString(36);
    }
  }
  return suffix;
}

function generatedSlugs(name: string) {
  const base = toSlug(name);
  const stem = base.slice(0, STEM_MAX).replace(/-+$/, "") || "org";
  const suffixed = () => `${stem}-${randomSuffix()}`;
  const first = base.length >= SLUG_MIN ? [base] : [suffixed()];
  return [...first, ...Array.from({ length: ATTEMPTS - 1 }, suffixed)];
}

export async function createOrganization(
  client: Client,
  input: { name: string; slug: string },
): Promise<CreateOrganizationResult> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "invalid_name" };
  const slug = slugSchema.safeParse(input.slug);
  if (!slug.success) return { ok: false, error: "invalid_slug" };

  // No .select(): the select policy is checked before the owner trigger adds the membership.
  const insert = (value: string) =>
    client.from("organizations").insert({ name: name.data, slug: value });

  const explicit = slug.data !== "";
  for (const candidate of explicit ? [slug.data] : generatedSlugs(name.data)) {
    const { error } = await insert(candidate);
    if (!error) return { ok: true, slug: candidate };
    if (error.code === UNIQUE_VIOLATION) {
      if (explicit) return { ok: false, error: "slug_taken" };
      continue;
    }
    console.error("Unexpected organization error", {
      code: error.code,
      message: error.message,
    });
    break;
  }
  return { ok: false, error: "unknown" };
}
