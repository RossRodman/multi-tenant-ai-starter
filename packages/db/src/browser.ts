import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

import type { Client } from "./client";
import type { Database } from "./database.types";

export interface BrowserClientOptions {
  url: string;
  key: string;
}

export function createBrowserClient({ url, key }: BrowserClientOptions): Client {
  return createSsrBrowserClient<Database>(url, key);
}
