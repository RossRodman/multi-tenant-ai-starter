import { createClient } from "@supabase/supabase-js";

import type { Client } from "./client";
import type { Database } from "./database.types";

export interface ServiceClientOptions {
  url: string;
  secretKey: string;
}

export function createServiceClient({ url, secretKey }: ServiceClientOptions): Client {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
