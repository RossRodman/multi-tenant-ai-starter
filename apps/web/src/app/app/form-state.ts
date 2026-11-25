import type { CreateOrganizationError } from "@/server/organizations";
import { NAME_MAX, SLUG_MAX, SLUG_MIN } from "@/lib/slug";

export type OrganizationFormError = "rate_limited" | "unknown";

export interface OrganizationFormState {
  error?: OrganizationFormError;
  fieldErrors?: { name?: string; slug?: string };
  values?: { name: string; slug: string };
}

export const ACCEPT_ERROR_PARAM = "error";
export const ACCEPT_ERROR_UNKNOWN = "unknown";
export const ACCEPT_ERROR_SEAT_LIMIT = "seat_limit";

export const initialState: OrganizationFormState = {};

export const errorMessages: Record<OrganizationFormError, string> = {
  rate_limited: "Too many attempts. Try again later.",
  unknown: "Something went wrong. Try again.",
};

export const fieldMessages: Record<Exclude<CreateOrganizationError, "unknown">, string> = {
  invalid_name: `Use 1 to ${String(NAME_MAX)} characters, without control or invisible characters.`,
  invalid_slug: `Use ${String(SLUG_MIN)} to ${String(SLUG_MAX)} lowercase letters, numbers and single dashes.`,
  slug_taken: "This slug is already taken.",
};
