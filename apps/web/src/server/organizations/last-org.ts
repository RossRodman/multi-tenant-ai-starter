import "server-only";

import { sessionCookieOptions } from "../supabase/cookies";

export const LAST_ORG_COOKIE = "last_org";

const ONE_YEAR = 365 * 24 * 60 * 60;

export function lastOrgCookieOptions(appUrl: string) {
  return sessionCookieOptions(appUrl, { maxAge: ONE_YEAR });
}
