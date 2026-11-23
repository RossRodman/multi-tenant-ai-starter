import "server-only";

import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The fixed key every local `supabase start` uses. Not a secret; a public deployment using it
// was built with local values.
const SUPABASE_CLI_DEMO_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const publicValue = (schema: z.ZodType<string>) =>
  schema.refine((value) => !value.startsWith("sb_secret_"), {
    error: "must not be a Supabase secret key",
  });

const schema = z.object({
  NEXT_PUBLIC_APP_URL: publicValue(z.url()),
  NEXT_PUBLIC_SUPABASE_URL: publicValue(z.url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicValue(z.string().min(1)),
  AUTH_GOOGLE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  TRUSTED_PROXY_HOPS: z
    .string()
    .regex(/^[1-9]\d*$/, { error: "must be a positive integer" })
    .default("1")
    .transform(Number),
});

export interface ServerEnv {
  appUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleEnabled: boolean;
  trustedProxyHops: number;
}

const isLoopback = (url: string) => LOOPBACK_HOSTS.has(new URL(url).hostname);

export function parseServerEnv(
  source: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): ServerEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }

  const env = parsed.data;
  if (nodeEnv === "production" && !isLoopback(env.NEXT_PUBLIC_APP_URL)) {
    if (isLoopback(env.NEXT_PUBLIC_SUPABASE_URL)) {
      throw new Error(
        "Invalid environment: NEXT_PUBLIC_SUPABASE_URL points at a local Supabase while NEXT_PUBLIC_APP_URL is public",
      );
    }
    if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === SUPABASE_CLI_DEMO_KEY) {
      throw new Error(
        "Invalid environment: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the Supabase CLI demo key while NEXT_PUBLIC_APP_URL is public",
      );
    }
  }

  return {
    appUrl: env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    googleEnabled: env.AUTH_GOOGLE_ENABLED,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  };
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(
    {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      AUTH_GOOGLE_ENABLED: process.env.AUTH_GOOGLE_ENABLED,
      TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
    },
    process.env.NODE_ENV,
  );
  return cached;
}
