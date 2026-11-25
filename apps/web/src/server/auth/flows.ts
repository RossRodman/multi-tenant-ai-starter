import "server-only";

import type { Client } from "@repo/db";

import { fail } from "./errors";
import type { AuthResult, RawAuthError } from "./errors";
import { getSessionUser, isRecoverySession } from "./session";
import type { EmailLink } from "./schemas";

const OK = { ok: true } as const;

const EMAIL_SEND_LIMIT = "over_email_send_rate_limit";

function result(error: RawAuthError | null, tolerated: string[] = []): AuthResult {
  if (!error) return OK;
  if (error.code && tolerated.includes(error.code)) return OK;
  return fail(error);
}

export async function signUp(
  client: Client,
  { email, password, name }: { email: string; password: string; name: string },
): Promise<AuthResult> {
  const { error } = await client.auth.signUp({ email, password, options: { data: { name } } });
  return result(error, ["email_exists", "user_already_exists", EMAIL_SEND_LIMIT]);
}

export async function signInWithPassword(
  client: Client,
  credentials: { email: string; password: string },
): Promise<AuthResult> {
  const { error } = await client.auth.signInWithPassword(credentials);
  return result(error);
}

export async function sendMagicLink(client: Client, email: string): Promise<AuthResult> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  return result(error, ["otp_disabled", EMAIL_SEND_LIMIT]);
}

export async function resendConfirmation(client: Client, email: string): Promise<AuthResult> {
  const { error } = await client.auth.resend({ type: "signup", email });
  return result(error, [EMAIL_SEND_LIMIT]);
}

export async function requestPasswordReset(client: Client, email: string): Promise<AuthResult> {
  const { error } = await client.auth.resetPasswordForEmail(email);
  return result(error, [EMAIL_SEND_LIMIT]);
}

export async function verifyEmailLink(
  client: Client,
  { tokenHash, type, email }: EmailLink,
): Promise<AuthResult> {
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return result(error);

  const user = await getSessionUser(client);
  if (user?.email?.toLowerCase() !== email) {
    await signOut(client);
    return { ok: false, error: "invalid_link" };
  }
  return OK;
}

export async function exchangeOAuthCode(client: Client, code: string): Promise<AuthResult> {
  const { error } = await client.auth.exchangeCodeForSession(code);
  return result(error);
}

export async function startGoogleSignIn(
  client: Client,
  redirectTo: string,
): Promise<AuthResult<{ url: string }>> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return fail(error);
  return { ok: true, url: data.url };
}

export async function updatePassword(
  client: Client,
  password: string,
  recoveryMarker: string | undefined,
): Promise<AuthResult> {
  if (!isRecoverySession(await getSessionUser(client), recoveryMarker)) {
    return { ok: false, error: "invalid_link" };
  }
  const { error } = await client.auth.updateUser({ password });
  return result(error);
}

export async function signOut(client: Client): Promise<AuthResult> {
  const { error } = await client.auth.signOut({ scope: "local" });
  return result(error);
}
