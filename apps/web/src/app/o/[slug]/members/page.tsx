import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/avatar";
import { RolePill } from "@/components/role-pill";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { assignableRoles, canManage, canManageRole, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { listPendingInvitations } from "@/server/invitations";
import { listMembers } from "@/server/members";
import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import {
  changeRoleAction,
  leaveOrganizationAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "../actions";
import { isMemberStatus, memberStatusMessages } from "../form-state";
import { InviteButton } from "./invite-button";
import { InviteForm } from "./invite-form";
import { MemberMenu } from "./member-menu";

const CARD = "rounded-[14px] border border-input bg-background";

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
      className="size-[18px]"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px]"
    >
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="m3.5 6.5 6.5 5 6.5-5" />
    </svg>
  );
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-input px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const client = await getSupabase();
  const organization = await currentOrganization(user.id, (await params).slug);
  if (!organization) notFound();

  const { status, tab: tabParam } = await searchParams;
  const canInvite = canManage(organization.role);
  const tab = canInvite && tabParam === "invitations" ? "invitations" : "members";
  const [members, pending] = await Promise.all([
    listMembers(client, organization.id),
    canInvite ? listPendingInvitations(client, organization.id) : [],
  ]);
  const assignable = assignableRoles(organization.role);
  const notice = isMemberStatus(status) ? memberStatusMessages[status] : null;
  const tabClass = "flex min-h-11 items-center border-b-2 px-1 text-[15px]";

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">Manage who has access to {organization.name}.</p>
        </div>
        {canInvite ? (
          <InviteButton>
            <PlusIcon />
            Invite members
          </InviteButton>
        ) : null}
      </div>
      {notice ? <Alert variant={notice.variant}>{notice.text}</Alert> : null}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_32rem] flex-col gap-4">
          <nav aria-label="Members sections" className="flex gap-5 border-b border-input">
            {(
              [
                { id: "members", label: "Members", count: members.length },
                ...(canInvite
                  ? [{ id: "invitations", label: "Invitations", count: pending.length }]
                  : []),
              ] as const
            ).map(({ id, label, count }) => (
              <Link
                key={id}
                href={
                  `/o/${organization.slug}/members${id === "members" ? "" : `?tab=${id}`}` as Route
                }
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  tabClass,
                  tab === id
                    ? "border-primary font-semibold"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {label} · {count}
              </Link>
            ))}
          </nav>

          {tab === "members" ? (
            <section id="members" aria-label="Members" className={cn(CARD, "overflow-hidden")}>
              <div className="relative overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <Th className="w-full">Name</Th>
                      <Th className="w-36">Role</Th>
                      <Th className="hidden w-40 sm:table-cell">Joined</Th>
                      <Th className="w-16">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const isSelf = member.userId === user.id;
                      const editable = canManageRole(organization.role, member.role);
                      return (
                        <tr key={member.userId} className="border-b border-input last:border-b-0">
                          <td className="max-w-0 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <UserAvatar email={member.email} name={member.name} />
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="truncate font-semibold">
                                    {member.name ?? member.email}
                                  </span>
                                  {isSelf ? (
                                    <span className="text-[13px] text-muted-foreground">You</span>
                                  ) : null}
                                </div>
                                {member.name ? (
                                  <div className="truncate text-[13px] text-muted-foreground">
                                    {member.email}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <RolePill role={member.role} />
                          </td>
                          <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground sm:table-cell">
                            {formatDate(member.joinedAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isSelf || editable ? (
                              <MemberMenu
                                email={member.email}
                                slug={organization.slug}
                                userId={member.userId}
                                roles={editable ? assignable.filter((r) => r !== member.role) : []}
                                changeRole={changeRoleAction}
                                removal={
                                  isSelf
                                    ? {
                                        action: leaveOrganizationAction,
                                        label: "Leave organization",
                                        title: `Leave ${organization.name}?`,
                                        description:
                                          "You lose access to this organization until someone invites you again.",
                                        confirmLabel: "Leave",
                                      }
                                    : {
                                        action: removeMemberAction,
                                        label: "Remove from organization",
                                        title: `Remove ${member.name ?? member.email}?`,
                                        description: `${member.name ?? member.email} loses access to ${organization.name}.`,
                                        confirmLabel: "Remove",
                                      }
                                }
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {canInvite && tab === "invitations" ? (
            <section
              id="invitations"
              className={cn(CARD, "flex flex-col gap-4 p-6")}
              aria-labelledby="pending-heading"
            >
              <h2 id="pending-heading" className="text-base font-bold">
                Pending invitations
              </h2>
              {pending.length > 0 ? (
                <ul>
                  {pending.map((invitation) => {
                    const manageable = canManageRole(organization.role, invitation.role);
                    const expired = new Date(invitation.expiresAt) < new Date();
                    return (
                      <li
                        key={invitation.id}
                        className="flex flex-wrap items-center gap-3 border-t border-input py-3"
                      >
                        <span
                          aria-hidden
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground"
                        >
                          <MailIcon />
                        </span>
                        <div className="min-w-0 flex-[1_1_12rem]">
                          <div className="text-sm font-semibold break-all">{invitation.email}</div>
                          <div className="text-[13px] text-muted-foreground">
                            {roleLabel(invitation.role)} · Invited by {invitation.invitedByEmail} ·{" "}
                            {expired ? "Expired" : `Expires ${formatDate(invitation.expiresAt)}`}
                          </div>
                        </div>
                        {manageable
                          ? (["resend", "revoke"] as const).map((kind) => (
                              <form
                                key={kind}
                                action={
                                  kind === "resend"
                                    ? resendInvitationAction
                                    : revokeInvitationAction
                                }
                              >
                                <input type="hidden" name="slug" value={organization.slug} />
                                <input type="hidden" name="id" value={invitation.id} />
                                <Button
                                  type="submit"
                                  variant="outline"
                                  className="h-9 w-auto px-3.5 text-sm"
                                >
                                  {kind === "resend" ? "Resend" : "Revoke"}
                                </Button>
                              </form>
                            ))
                          : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No pending invitations.</p>
              )}
            </section>
          ) : null}
        </div>

        {canInvite ? (
          <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-4">
            <section
              id="invite"
              className={cn(CARD, "flex flex-col gap-4 p-6")}
              aria-labelledby="invite-heading"
            >
              <h2 id="invite-heading" className="text-base font-bold">
                Invite people
              </h2>
              <InviteForm slug={organization.slug} viewerRole={organization.role} />
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
