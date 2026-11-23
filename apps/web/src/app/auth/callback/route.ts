import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { exchangeOAuthCode, safeNext } from "@/server/auth";
import { getServerEnv } from "@/server/env";
import { getSupabase } from "@/server/supabase/client";

export async function GET(request: NextRequest) {
  const { appUrl } = getServerEnv();
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const result = code ? await exchangeOAuthCode(await getSupabase(), code) : null;
  const destination = result?.ok ? next : "/sign-in?error=oauth";
  return NextResponse.redirect(new URL(destination, appUrl));
}
