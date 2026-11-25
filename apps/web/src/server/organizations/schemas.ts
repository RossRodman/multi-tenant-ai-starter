import "server-only";

import { z } from "zod";

import { isSlug } from "@/lib/slug";

import { displayNameSchema } from "../display-name";

export const nameSchema = displayNameSchema;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((slug) => slug === "" || isSlug(slug));
