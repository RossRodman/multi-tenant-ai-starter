export type AppDestination =
  { kind: "redirect"; slug: string } | { kind: "create" } | { kind: "chooser" };

export function appDestination({
  invitationParam,
  pendingInvitations,
  lastOrg,
  organizations,
}: {
  invitationParam: string | undefined;
  pendingInvitations: number;
  lastOrg: string | undefined;
  organizations: { slug: string }[];
}): AppDestination {
  if (invitationParam || pendingInvitations > 0) return { kind: "chooser" };

  const last = organizations.find((organization) => organization.slug === lastOrg);
  if (last) return { kind: "redirect", slug: last.slug };

  if (organizations.length === 0) return { kind: "create" };
  const [only] = organizations;
  return organizations.length === 1 && only
    ? { kind: "redirect", slug: only.slug }
    : { kind: "chooser" };
}
