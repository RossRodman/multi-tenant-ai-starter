import "server-only";

import { createServerClient } from "@repo/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isSlug } from "@/lib/slug";

import { safeNext } from "../auth/safe-next";
import { getServerEnv } from "../env";
import { LAST_ORG_COOKIE, lastOrgCookieOptions } from "../organizations/last-org";
import { hardenCookies } from "./cookies";

const ORGANIZATION_PATH = /^\/o\/([^/]+)/;

function isPrefetch(request: NextRequest) {
  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.startsWith("prefetch") === true
  );
}

function isProtected(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/o/");
}

export async function refreshSession(request: NextRequest) {
  const env = getServerEnv();
  let response = NextResponse.next({ request });
  let responseHeaders: Record<string, string> = {};

  const supabase = createServerClient({
    url: env.supabaseUrl,
    key: env.supabasePublishableKey,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        const cookies = hardenCookies(env.appUrl, toSet);
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        responseHeaders = headers;
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;

  if (!data) {
    if (!isProtected(pathname) || (request.method !== "GET" && request.method !== "HEAD")) {
      return response;
    }
    const signIn = new URL("/sign-in", env.appUrl);
    signIn.searchParams.set("next", safeNext(pathname + search));
    const redirect = NextResponse.redirect(signIn);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [key, value] of Object.entries(responseHeaders)) redirect.headers.set(key, value);
    return redirect;
  }

  const slug = ORGANIZATION_PATH.exec(pathname)?.[1];
  if (
    slug &&
    isSlug(slug) &&
    !isPrefetch(request) &&
    request.cookies.get(LAST_ORG_COOKIE)?.value !== slug
  ) {
    response.cookies.set(LAST_ORG_COOKIE, slug, lastOrgCookieOptions(env.appUrl));
  }
  return response;
}
