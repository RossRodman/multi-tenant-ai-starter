import { notFound } from "next/navigation";

import { canManage } from "@/lib/roles";
import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";

import { RenameForm, SlugForm } from "./settings-forms";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const organization = await currentOrganization(user.id, (await params).slug);
  if (!organization || !canManage(organization.role)) notFound();

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Settings</h1>
      <section className="flex flex-col gap-3 rounded-xl border border-input bg-background p-6">
        <h2 className="text-base font-bold">Name</h2>
        <RenameForm slug={organization.slug} name={organization.name} />
      </section>
      <section className="flex flex-col gap-3 rounded-xl border border-input bg-background p-6">
        <h2 className="text-base font-bold">Slug</h2>
        <SlugForm slug={organization.slug} />
      </section>
    </div>
  );
}
