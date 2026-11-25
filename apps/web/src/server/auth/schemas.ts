import "server-only";

import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/lib/password";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH);

const emailLinkSchema = z.object({
  tokenHash: z.string().min(1),
  type: z.enum(["signup", "magiclink", "recovery", "email"]),
  email: emailSchema,
});

export type EmailLink = z.infer<typeof emailLinkSchema>;

export function parseEmailLink(params: {
  token_hash?: unknown;
  type?: unknown;
  email?: unknown;
}): EmailLink | null {
  const parsed = emailLinkSchema.safeParse({
    tokenHash: params.token_hash,
    type: params.type,
    email: params.email,
  });
  return parsed.success ? parsed.data : null;
}
