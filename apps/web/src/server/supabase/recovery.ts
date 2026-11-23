import "server-only";

import { cookies } from "next/headers";

import { getServerEnv } from "../env";
import { sessionCookieOptions } from "./cookies";

const NAME = "app-recovery-session";
const ONE_HOUR = 60 * 60;

export async function markRecoverySession(sessionId: string) {
  const store = await cookies();
  store.set(NAME, sessionId, sessionCookieOptions(getServerEnv().appUrl, { maxAge: ONE_HOUR }));
}

export async function getRecoveryMarker() {
  const store = await cookies();
  return store.get(NAME)?.value;
}

export async function clearRecoveryMarker() {
  const store = await cookies();
  store.delete(NAME);
}
