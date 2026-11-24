import Link from "next/link";

import { requireUser } from "@/server/session";

import { CreateOrganizationForm } from "../create-organization-form";

export default async function NewOrganizationPage() {
  await requireUser();

  return (
    <>
      <CreateOrganizationForm title="New organization" />
      <Link href="/app" className="text-sm text-ring underline-offset-4 hover:underline">
        Back to organizations
      </Link>
    </>
  );
}
