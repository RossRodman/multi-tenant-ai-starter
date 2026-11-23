import { PASSWORD_LENGTH_MESSAGE } from "@/lib/password";
import type { AuthError } from "@/server/auth";

export interface FormState {
  error?: AuthError;
  fieldErrors?: { email?: string; password?: string };
  notice?: "check-email" | "link-if-exists";
  email?: string;
}

export const initialState: FormState = {};

export const errorMessages: Record<AuthError, string> = {
  invalid_credentials: "Email or password is incorrect.",
  email_not_confirmed: "Confirm your email before signing in.",
  weak_password: PASSWORD_LENGTH_MESSAGE,
  same_password: "Choose a password you have not used before.",
  rate_limited: "Too many attempts. Try again in a few minutes.",
  invalid_link: "This link has expired or was already used.",
  unknown: "Something went wrong. Try again.",
};

export function noticeMessage(notice: NonNullable<FormState["notice"]>, email: string) {
  return notice === "check-email"
    ? `Check your email. We sent a link to ${email}.`
    : `If an account exists for ${email}, we sent a link.`;
}
