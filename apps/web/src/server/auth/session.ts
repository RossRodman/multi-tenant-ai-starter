import "server-only";

import type { Client } from "@repo/db";

import { displayNameSchema } from "../display-name";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  sessionId: string;
}

export async function getSessionUser(client: Client): Promise<SessionUser | null> {
  const { data, error } = await client.auth.getClaims();
  if (error || !data) return null;

  const { claims } = data;
  return {
    id: claims.sub,
    email: claims.email ?? null,
    name: displayNameSchema.safeParse(claims.user_metadata?.name).data ?? null,
    sessionId: claims.session_id,
  };
}

export function isRecoverySession(user: SessionUser | null, marker: string | undefined): boolean {
  return user !== null && marker !== undefined && user.sessionId === marker;
}
