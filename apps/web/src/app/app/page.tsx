import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listOrganizations } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import { CreateOrganizationForm } from "./create-organization-form";

export default async function AppHomePage() {
  const user = await requireUser();
  const organizations = await listOrganizations(await getSupabase(), user.id);

  if (organizations.length === 0) {
    return <CreateOrganizationForm title="Create your organization" />;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[1.75rem] leading-tight font-semibold">Organizations</h1>
        <Link
          href="/app/new"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-auto shrink-0 whitespace-nowrap px-3",
          )}
        >
          New organization
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-input">
        {organizations.map((organization) => (
          <li key={organization.id} className="flex flex-col gap-0.5 py-3">
            <span className="font-medium">{organization.name}</span>
            <span className="text-sm text-muted-foreground">
              {organization.slug} · {organization.role}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
