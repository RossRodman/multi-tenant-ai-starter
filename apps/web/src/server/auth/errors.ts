import "server-only";

export type AuthError =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "invalid_link"
  | "unknown";

export type AuthResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: AuthError };

export interface RawAuthError {
  code?: string | undefined;
  status?: number | undefined;
  message: string;
}

const KNOWN: Partial<Record<string, AuthError>> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  weak_password: "weak_password",
  same_password: "same_password",
  over_request_rate_limit: "rate_limited",
  otp_expired: "invalid_link",
  flow_state_not_found: "invalid_link",
  flow_state_expired: "invalid_link",
  bad_code_verifier: "invalid_link",
};

export function fail(error: RawAuthError): { ok: false; error: AuthError } {
  const known =
    (error.code ? KNOWN[error.code] : undefined) ??
    (error.status === 429 ? "rate_limited" : undefined);
  if (known) return { ok: false, error: known };

  console.error("Unexpected auth error", {
    code: error.code,
    status: error.status,
    message: error.message,
  });
  return { ok: false, error: "unknown" };
}
