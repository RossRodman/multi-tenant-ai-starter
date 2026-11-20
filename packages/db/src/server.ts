import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";

import type { Client } from "./client";
import type { Database } from "./database.types";

export interface ServerClientOptions {
  url: string;
  key: string;
  cookies: Pick<CookieMethodsServer, "getAll" | "setAll">;
}

export function createServerClient({ url, key, cookies }: ServerClientOptions): Client {
  return createSsrServerClient<Database>(url, key, { cookies });
}
