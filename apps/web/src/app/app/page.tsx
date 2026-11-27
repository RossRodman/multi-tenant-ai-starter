import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrganizationAvatar } from "@/components/avatar";
import { OnboardingCard } from "@/components/onboarding-card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { appDestination } from "@/lib/app-destination";
import { memberCountLabel } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { listMyInvitations } from "@/server/invitations";
import { lastOpenedOrganization, listOrganizations } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import { acceptInvitationAction } from "./actions";
import {
  ACCEPT_ERROR_PARAM,
  ACCEPT_ERROR_SEAT_LIMIT,
  ACCEPT_ERROR_UNKNOWN,
  errorMessages,
} from "./form-state";

export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const client = await getSupabase();
  const params = await searchParams;
  const { invitation } = params;
  const invitationParam = typeof invitation === "string" ? invitation : undefined;

  const [organizations, invitations, lastOrg] = await Promise.all([
    listOrganizations(client, user.id),
    user.email ? listMyInvitations(client, user.email) : [],
    lastOpenedOrganization(client),
  ]);

  const destination = appDestination({
    invitationParam,
    pendingInvitations: invitations.length,
    lastOrg,
    organizations,
  });
  if (destination.kind === "redirect") redirect(`/o/${destination.slug}` as Route);
  if (destination.kind === "create") redirect("/app/new");

  const failed = params[ACCEPT_ERROR_PARAM] === ACCEPT_ERROR_UNKNOWN;
  const full = params[ACCEPT_ERROR_PARAM] === ACCEPT_ERROR_SEAT_LIMIT;
  const fullInvitation = full ? invitations.find(({ id }) => id === invitationParam) : undefined;
  const unavailable =
    !failed &&
    !fullInvitation &&
    invitationParam &&
    !invitations.some(({ id }) => id === invitationParam);

  return (
    <OnboardingCard
      title="Choose an organization"
      description="Pick where you want to work. You can belong to several and switch any time."
    >
      <div className="flex flex-col gap-5">
        {failed ? <Alert variant="destructive">{errorMessages.unknown}</Alert> : null}
        {fullInvitation ? (
          <Alert variant="destructive">
            {fullInvitation.organization.name} has no free seats. Ask an owner to upgrade.
          </Alert>
        ) : null}
        {unavailable ? (
          <Alert variant="destructive">
            This invitation is not available for {user.email}. It may have been accepted, expired,
            been revoked or been sent to another address.
          </Alert>
        ) : null}

        {invitations.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="invitations-heading">
            <h2
              id="invitations-heading"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Invitations
            </h2>
            <ul className="flex flex-col gap-2">
              {invitations.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-input bg-background p-3",
                    item.id === invitationParam && "ring-2 ring-ring",
                  )}
                >
                  <OrganizationAvatar name={item.organization.name} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.organization.name}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      Invited by {item.invitedByEmail} as {roleLabel(item.role)}
                    </span>
                  </div>
                  <form action={acceptInvitationAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <Button type="submit" className="w-auto px-3 whitespace-nowrap">
                      Accept and join
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {organizations.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="organizations-heading">
            <h2
              id="organizations-heading"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Your organizations
            </h2>
            <ul className="flex flex-col gap-2">
              {organizations.map((organization) => (
                <li
                  key={organization.id}
                  className="flex items-center gap-3 rounded-lg border border-input bg-background p-3"
                >
                  <OrganizationAvatar name={organization.name} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{organization.name}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {organization.slug}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      You are {roleLabel(organization.role)} ·{" "}
                      {memberCountLabel(organization.memberCount)}
                    </span>
                  </div>
                  <Link
                    href={`/o/${organization.slug}` as Route}
                    className={cn(buttonVariants({ variant: "outline" }), "w-auto px-3")}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href="/app/new"
          className="flex h-10 items-center justify-center rounded-lg border border-dashed border-input text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          + Create a new organization
        </Link>
      </div>
    </OnboardingCard>
  );
}
