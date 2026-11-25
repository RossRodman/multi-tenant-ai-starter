import { createSessionlessClient } from "../src";
import { env } from "./env";

const PASSWORD = "correct-horse-battery";

const admin = createSessionlessClient({ url: env.url, key: env.secretKey });

export function unique(label: string) {
  return `${label}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createUser(label: string, name?: string) {
  const email = `${unique(label)}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: name === undefined ? undefined : { name },
  });
  if (created.error) throw created.error;

  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;

  return { id: created.data.user.id, email, client };
}

export function deleteUser(id: string) {
  return admin.auth.admin.deleteUser(id);
}

export function anonClient() {
  return createSessionlessClient({ url: env.url, key: env.publishableKey });
}
