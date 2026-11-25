import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutForm } from "@/app/app/sign-out-form";
import { UserAvatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { canManage } from "@/lib/roles";
import { listMyInvitations } from "@/server/invitations";
import { currentOrganization, listOrganizations } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { OrganizationSwitcher } from "./switcher";

export default async function OrganizationLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ slug: string }> }>) {
  const user = await requireUser();
  const client = await getSupabase();
  const [organization, organizations, invitations] = await Promise.all([
    currentOrganization(user.id, (await params).slug),
    listOrganizations(client, user.id),
    user.email ? listMyInvitations(client, user.email) : [],
  ]);
  if (!organization) notFound();

  const switcher = (
    <OrganizationSwitcher
      current={organization}
      organizations={organizations}
      pendingInvitations={invitations.length}
    />
  );
  const links = <NavLinks slug={organization.slug} showSettings={canManage(organization.role)} />;
  const footer = (
    <div className="flex items-center gap-3 border-t border-input pt-4">
      <UserAvatar email={user.email ?? "?"} name={user.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        {user.name ? <span className="truncate text-sm font-semibold">{user.name}</span> : null}
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </span>
      <SignOutForm />
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas md:flex">
      <aside className="hidden w-66 shrink-0 flex-col justify-between gap-6 border-r border-input bg-background p-3 md:flex">
        <div className="flex flex-col gap-5">
          <div className="px-1 pt-1">
            <Logo />
          </div>
          <div className="flex">{switcher}</div>
          {links}
        </div>
        {footer}
      </aside>
      <MobileNav switcher={switcher}>
        <div className="flex h-full flex-col justify-between gap-6 p-3 pt-4">
          {links}
          {footer}
        </div>
      </MobileNav>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
