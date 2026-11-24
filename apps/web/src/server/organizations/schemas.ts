import "server-only";

import { z } from "zod";

import { NAME_MAX, SLUG_MAX, SLUG_MIN, SLUG_PATTERN } from "@/lib/slug";

const INVISIBLE_OR_BIDI =
  /[\p{Cc}\u061c\u180e\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/u;

const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

export const nameSchema = z
  .string()
  .trim()
  .refine((name) => {
    const length = Array.from(name).length;
    return length >= 1 && length <= NAME_MAX;
  })
  .refine((name) => !INVISIBLE_OR_BIDI.test(name) && VISIBLE.test(name));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (slug) =>
      slug === "" ||
      (slug.length >= SLUG_MIN && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug)),
  );
