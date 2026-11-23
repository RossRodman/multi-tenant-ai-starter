import "server-only";

import { createServerClient } from "@repo/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerEnv } from "../env";
import { hardenCookies } from "./cookies";

export async function refreshSession(request: NextRequest) {
  const env = getServerEnv();
  let response = NextResponse.next({ request });

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
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
