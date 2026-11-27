import "server-only";

import { cookies } from "next/headers";

import { getServerEnv } from "../env";
import { getSupabase } from "../supabase/client";
import { LAST_ORG_COOKIE, lastOrgCookieOptions } from "./last-org";
import { markOrganizationOpened } from "./opened";

export async function rememberOrganization(slug: string) {
  (await cookies()).set(LAST_ORG_COOKIE, slug, lastOrgCookieOptions(getServerEnv().appUrl));
  await markOrganizationOpened(await getSupabase(), slug);
}

export async function forgetOrganization() {
  (await cookies()).set(LAST_ORG_COOKIE, "", {
    ...lastOrgCookieOptions(getServerEnv().appUrl),
    maxAge: 0,
  });
}
