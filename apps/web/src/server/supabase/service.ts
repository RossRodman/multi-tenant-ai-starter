import "server-only";

import { createServiceClient } from "@repo/db";
import type { Client } from "@repo/db";

import { getServerEnv } from "../env";

export function getServiceSupabase(): Client {
  const env = getServerEnv();
  if (!env.supabaseSecretKey) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createServiceClient({ url: env.supabaseUrl, secretKey: env.supabaseSecretKey });
}
