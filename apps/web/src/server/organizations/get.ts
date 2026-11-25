import "server-only";

import type { Client, MembershipRole, Organization } from "@repo/db";

export type CurrentOrganization = Pick<Organization, "id" | "name" | "slug"> & {
  role: MembershipRole;
};

export async function getOrganization(
  client: Client,
  userId: string,
  slug: string,
): Promise<CurrentOrganization | null> {
  const { data, error } = await client
    .from("organizations")
    .select("id, name, slug, memberships!inner(role)")
    .eq("slug", slug)
    .eq("memberships.user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load the organization", { cause: error });
  if (!data) return null;

  const { memberships, ...organization } = data;
  const role = memberships[0]?.role;
  return role ? { ...organization, role } : null;
}
