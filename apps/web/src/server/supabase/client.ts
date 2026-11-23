import "server-only";

import { createServerClient, createSessionlessClient } from "@repo/db";
import type { Client } from "@repo/db";
import { cookies } from "next/headers";

import { getServerEnv } from "../env";
import { hardenCookies } from "./cookies";

export async function getSupabase(): Promise<Client> {
  const store = await cookies();
  const env = getServerEnv();

  return createServerClient({
    url: env.supabaseUrl,
    key: env.supabasePublishableKey,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of hardenCookies(env.appUrl, toSet)) {
            store.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session.
        }
      },
    },
  });
}

export function getSessionlessSupabase(): Client {
  const env = getServerEnv();
  return createSessionlessClient({ url: env.supabaseUrl, key: env.supabasePublishableKey });
}
