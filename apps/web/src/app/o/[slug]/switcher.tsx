"use client";

import Link from "next/link";
import type { Route } from "next";

import type { MembershipRole } from "@repo/db";

import { OrganizationAvatar } from "@/components/avatar";
import { memberCountLabel } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OrganizationSwitcher({
  current,
  organizations,
  pendingInvitations,
}: {
  current: { name: string; slug: string; role: MembershipRole };
  organizations: {
    id: string;
    name: string;
    slug: string;
    role: MembershipRole;
    memberCount: number;
  }[];
  pendingInvitations: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-input bg-background p-2 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring">
        <OrganizationAvatar name={current.name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{current.name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(current.role)}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        >
          <path d="m6 8 4-4 4 4M6 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem key={organization.id} asChild>
            <Link href={`/o/${organization.slug}` as Route}>
              <OrganizationAvatar name={organization.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{organization.name}</span>
                <span className="text-xs text-muted-foreground">
                  {roleLabel(organization.role)} · {memberCountLabel(organization.memberCount)}
                </span>
              </span>
              {organization.slug === current.slug ? (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-label="Current organization"
                  role="img"
                  className="size-4 shrink-0 text-primary"
                >
                  <path d="m3.5 8.5 3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {pendingInvitations > 0 ? (
          <DropdownMenuItem asChild>
            <Link href="/app">Pending invitations ({pendingInvitations})</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/app/new">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
              className="size-4"
            >
              <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
            </svg>
            Create organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
