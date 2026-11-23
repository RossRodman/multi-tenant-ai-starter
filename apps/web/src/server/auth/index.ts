import "server-only";

export type { AuthError, AuthResult } from "./errors";
export {
  exchangeOAuthCode,
  requestPasswordReset,
  resendConfirmation,
  sendMagicLink,
  signInWithPassword,
  signOut,
  signUp,
  startGoogleSignIn,
  updatePassword,
  verifyEmailLink,
} from "./flows";
export { DEFAULT_NEXT, safeNext } from "./safe-next";
export { emailSchema, parseEmailLink, passwordSchema } from "./schemas";
export type { EmailLink } from "./schemas";
export { getSessionUser, isRecoverySession } from "./session";
export type { SessionUser } from "./session";
