import "server-only";

import type { Client } from "@repo/db";

export async function markOrganizationOpened(client: Client, slug: string): Promise<boolean> {
  const { error } = await client.rpc("mark_organization_opened", { slug });
  return !error;
}

export async function lastOpenedOrganization(client: Client): Promise<string | undefined> {
  const { data, error } = await client.rpc("last_opened_organization");
  if (error) throw new Error("Could not load the last organization", { cause: error });
  return data || undefined;
}
