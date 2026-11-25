import "server-only";

import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The fixed key every local `supabase start` uses. Not a secret; a public deployment using it
// was built with local values.
const SUPABASE_CLI_DEMO_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const DEV_SMTP_URL = "smtp://127.0.0.1:54325";
const DEV_MAIL_FROM = "Multi-tenant AI Starter <no-reply@localhost>";
const MAIL_FROM_PATTERN =
  /^(?:[^<>"@,;:()\r\n]+<([^<>\s@,;:()]+@[^<>\s@,;:()]+)>|([^<>"\s@,;:()]+@[^<>\s@,;:()]+))$/;

const publicValue = (schema: z.ZodType<string>) =>
  schema.refine((value) => !value.startsWith("sb_secret_"), {
    error: "must not be a Supabase secret key",
  });

const mailFrom = z.string().refine((value) => MAIL_FROM_PATTERN.test(value.trim()), {
  error: "must be an address or Name <address>",
});

const smtpUrl = z.url({ protocol: /^smtps?$/ });

const optionalSecret = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const stripeSecretKey = z.string().regex(/^sk_(test|live)_\S+$/, {
  error: "must be a Stripe secret key (sk_test_ or sk_live_)",
});
const stripeWebhookSecret = z.string().regex(/^whsec_\S+$/, {
  error: "must be a Stripe webhook signing secret (whsec_)",
});

const buildSchema = (production: boolean) =>
  z.object({
    SMTP_URL: production ? smtpUrl : smtpUrl.default(DEV_SMTP_URL),
    MAIL_FROM: production ? mailFrom : mailFrom.default(DEV_MAIL_FROM),
    SUPABASE_SECRET_KEY: production ? z.string().min(1) : optionalSecret(z.string().min(1)),
    STRIPE_SECRET_KEY: production
      ? stripeSecretKey
      : optionalSecret(
          stripeSecretKey.refine((key) => !key.startsWith("sk_live_"), {
            error: "a live Stripe key is only accepted in production",
          }),
        ),
    STRIPE_WEBHOOK_SECRET: production ? stripeWebhookSecret : optionalSecret(stripeWebhookSecret),
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
  smtpUrl: string;
  mailFrom: string;
  supabaseSecretKey: string | undefined;
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
}

const isLoopback = (url: string) => LOOPBACK_HOSTS.has(new URL(url).hostname);

export function parseServerEnv(
  source: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): ServerEnv {
  const parsed = buildSchema(nodeEnv === "production").safeParse(source);
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
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM.trim(),
    supabaseSecretKey: env.SUPABASE_SECRET_KEY,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  };
}

export const billingConfigured = (env: ServerEnv) =>
  env.supabaseSecretKey !== undefined &&
  env.stripeSecretKey !== undefined &&
  env.stripeWebhookSecret !== undefined;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(
    {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      AUTH_GOOGLE_ENABLED: process.env.AUTH_GOOGLE_ENABLED,
      TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
      SMTP_URL: process.env.SMTP_URL,
      MAIL_FROM: process.env.MAIL_FROM,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    },
    process.env.NODE_ENV,
  );
  return cached;
}
