import { z } from "zod";

const secretKey = z.string().regex(/^sk_(test|live)_\S+$/);

export function seedKey(value: string | undefined, allowLive: boolean): string {
  const parsed = secretKey.safeParse(value);
  if (!parsed.success) {
    throw new Error("Set STRIPE_SECRET_KEY to a Stripe secret key (sk_test_...).");
  }
  if (parsed.data.startsWith("sk_live_") && !allowLive) {
    throw new Error("Refusing to seed a live account. Pass --live to do it on purpose.");
  }
  return parsed.data;
}
