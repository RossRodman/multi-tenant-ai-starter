import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { memberCountLabel } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { listMembers } from "@/server/members";
import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const client = await getSupabase();
  const organization = await currentOrganization(user.id, (await params).slug);
  if (!organization) notFound();
  const members = await listMembers(client, organization.id);

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">
        {organization.name}
      </h1>
      <p className="text-muted-foreground">
        You are {roleLabel(organization.role)} · {memberCountLabel(members.length)}
      </p>
      <Link
        href={`/o/${organization.slug}/members` as Route}
        className="w-fit text-sm text-ring underline-offset-4 hover:underline"
      >
        View members
      </Link>
    </div>
  );
}
