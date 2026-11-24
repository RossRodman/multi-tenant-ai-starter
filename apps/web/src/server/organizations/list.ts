import "server-only";

import type { Client, MembershipRole, Organization } from "@repo/db";

type OrganizationSummary = Pick<Organization, "id" | "name" | "slug"> & { role: MembershipRole };

export async function listOrganizations(
  client: Client,
  userId: string,
): Promise<OrganizationSummary[]> {
  const { data, error } = await client
    .from("organizations")
    .select("id, name, slug, memberships!inner(role)")
    .eq("memberships.user_id", userId)
    .order("name")
    .order("slug");
  if (error) throw new Error("Could not list organizations", { cause: error });

  return data.flatMap(({ memberships, ...organization }) =>
    memberships.map(({ role }) => ({ ...organization, role })),
  );
}
