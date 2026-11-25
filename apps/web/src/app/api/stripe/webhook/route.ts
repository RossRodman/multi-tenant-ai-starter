import "server-only";

import { handleWebhook } from "@repo/billing";

import { getServerEnv } from "@/server/env";
import { getStripe } from "@/server/billing/stripe";
import { getServiceSupabase } from "@/server/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { stripeWebhookSecret, stripeSecretKey, supabaseSecretKey } = getServerEnv();
  if (!stripeWebhookSecret || !stripeSecretKey || !supabaseSecretKey) {
    return new Response(null, { status: 503 });
  }

  const { status } = await handleWebhook({
    stripe: getStripe(),
    db: getServiceSupabase(),
    payload: await request.text(),
    signature: request.headers.get("stripe-signature"),
    secret: stripeWebhookSecret,
  });
  return new Response(null, { status });
}
