import { createClient } from "@supabase/supabase-js";

import type { Client } from "./client";
import type { Database } from "./database.types";

export interface SessionlessClientOptions {
  url: string;
  key: string;
}

export function createSessionlessClient({ url, key }: SessionlessClientOptions): Client {
  return createClient<Database>(url, key, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
