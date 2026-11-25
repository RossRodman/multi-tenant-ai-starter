import "server-only";

import type { Client, MembershipRole, Organization } from "@repo/db";

type OrganizationSummary = Pick<Organization, "id" | "name" | "slug"> & {
  role: MembershipRole;
  memberCount: number;
};

export async function listOrganizations(
  client: Client,
  userId: string,
): Promise<OrganizationSummary[]> {
  const { data, error } = await client
    .from("organizations")
    .select("id, name, slug, own:memberships!inner(role), members:memberships(count)")
    .eq("own.user_id", userId)
    .order("name")
    .order("slug");
  if (error) throw new Error("Could not list organizations", { cause: error });

  return data.flatMap(({ own, members, ...organization }) =>
    own.map(({ role }) => ({ ...organization, role, memberCount: members[0]?.count ?? 0 })),
  );
}
