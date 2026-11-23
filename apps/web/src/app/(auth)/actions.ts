"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  DEFAULT_NEXT,
  emailSchema,
  getSessionUser,
  passwordSchema,
  parseEmailLink,
  requestPasswordReset,
  resendConfirmation,
  safeNext,
  sendMagicLink,
  signInWithPassword,
  signOut,
  signUp,
  startGoogleSignIn,
  updatePassword,
  verifyEmailLink,
} from "@/server/auth";
import type { AuthResult } from "@/server/auth";
import { PASSWORD_LENGTH_MESSAGE } from "@/lib/password";
import { getServerEnv } from "@/server/env";
import { authLimiter, clientIp } from "@/server/rate-limit";
import { getSessionlessSupabase, getSupabase } from "@/server/supabase/client";
import {
  clearRecoveryMarker,
  getRecoveryMarker,
  markRecoverySession,
} from "@/server/supabase/recovery";

import type { FormState } from "./form-state";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function parseEmail(formData: FormData) {
  const parsed = emailSchema.safeParse(text(formData, "email"));
  return parsed.success ? { email: parsed.data } : null;
}

const invalidEmail: FormState = { fieldErrors: { email: "Enter a valid email address." } };

async function allowed(email?: string) {
  return authLimiter.allow(clientIp(await headers(), getServerEnv().trustedProxyHops), email);
}

const rateLimited: FormState = { error: "rate_limited" };

function failed(result: Extract<AuthResult, { ok: false }>, email?: string): FormState {
  return { error: result.error, email };
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseEmail(formData);
  if (!parsed) return invalidEmail;
  const { email } = parsed;
  if (!(await allowed(email))) return { ...rateLimited, email };
  const intent = text(formData, "intent");

  if (intent === "magic-link") {
    const result = await sendMagicLink(getSessionlessSupabase(), email);
    return result.ok ? { notice: "link-if-exists", email } : failed(result, email);
  }

  if (intent === "resend") {
    const result = await resendConfirmation(getSessionlessSupabase(), email);
    return result.ok ? { notice: "check-email", email } : failed(result, email);
  }

  const password = text(formData, "password");
  if (!password) return { fieldErrors: { password: "Enter your password." }, email };

  const result = await signInWithPassword(await getSupabase(), { email, password });
  if (!result.ok) return failed(result, email);
  redirect(safeNext(text(formData, "next")) as Route);
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseEmail(formData);
  if (!parsed) return invalidEmail;
  const { email } = parsed;

  const password = passwordSchema.safeParse(text(formData, "password"));
  if (!password.success) {
    return { fieldErrors: { password: PASSWORD_LENGTH_MESSAGE }, email };
  }

  if (!(await allowed(email))) return { ...rateLimited, email };
  const result = await signUp(getSessionlessSupabase(), { email, password: password.data });
  return result.ok ? { notice: "check-email", email } : failed(result, email);
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseEmail(formData);
  if (!parsed) return invalidEmail;
  if (!(await allowed(parsed.email))) return { ...rateLimited, email: parsed.email };

  const result = await requestPasswordReset(getSessionlessSupabase(), parsed.email);
  return result.ok
    ? { notice: "link-if-exists", email: parsed.email }
    : failed(result, parsed.email);
}

export async function updatePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = passwordSchema.safeParse(text(formData, "password"));
  if (!password.success) return { fieldErrors: { password: PASSWORD_LENGTH_MESSAGE } };
  if (!(await allowed())) return rateLimited;

  const result = await updatePassword(
    await getSupabase(),
    password.data,
    await getRecoveryMarker(),
  );
  if (!result.ok) return failed(result);
  await clearRecoveryMarker();
  redirect(DEFAULT_NEXT);
}

export async function confirmEmailAction(formData: FormData): Promise<void> {
  const link = parseEmailLink({
    token_hash: text(formData, "token_hash"),
    type: text(formData, "type"),
  });
  if (!link) redirect("/auth/confirm?error=invalid_link");
  if (!(await allowed())) redirect("/auth/confirm?error=rate_limited");

  const supabase = await getSupabase();
  const result = await verifyEmailLink(supabase, link);
  if (!result.ok) redirect("/auth/confirm?error=invalid_link");

  if (link.type === "recovery") {
    const user = await getSessionUser(supabase);
    if (user) await markRecoverySession(user.sessionId);
    redirect("/reset-password");
  }
  redirect(DEFAULT_NEXT);
}

export async function googleSignInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const env = getServerEnv();
  if (!env.googleEnabled) return { error: "unknown" };

  const next = safeNext(text(formData, "next"));
  const callback = new URL("/auth/callback", env.appUrl);
  if (next !== DEFAULT_NEXT) callback.searchParams.set("next", next);

  const result = await startGoogleSignIn(await getSupabase(), callback.toString());
  if (!result.ok) return failed(result);
  redirect(result.url as Route);
}

export async function signOutAction(): Promise<void> {
  await signOut(await getSupabase());
  await clearRecoveryMarker();
  redirect("/sign-in");
}
