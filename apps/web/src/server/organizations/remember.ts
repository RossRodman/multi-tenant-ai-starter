import "server-only";

import { cookies } from "next/headers";

import { getServerEnv } from "../env";
import { LAST_ORG_COOKIE, lastOrgCookieOptions } from "./last-org";

export async function rememberOrganization(slug: string) {
  (await cookies()).set(LAST_ORG_COOKIE, slug, lastOrgCookieOptions(getServerEnv().appUrl));
}

export async function forgetOrganization() {
  (await cookies()).set(LAST_ORG_COOKIE, "", {
    ...lastOrgCookieOptions(getServerEnv().appUrl),
    maxAge: 0,
  });
}
