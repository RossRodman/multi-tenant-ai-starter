import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { DEFAULT_NEXT, getSessionUser } from "./auth";
import { getSupabase } from "./supabase/client";

export const currentUser = cache(async () => getSessionUser(await getSupabase()));

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${DEFAULT_NEXT}`);
  return user;
}

export async function redirectIfSignedIn() {
  if (await currentUser()) redirect(DEFAULT_NEXT);
}
