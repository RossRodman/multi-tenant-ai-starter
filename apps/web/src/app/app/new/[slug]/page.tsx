import { notFound } from "next/navigation";

import { canManage } from "@/lib/roles";
import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";

import { TeamStep } from "./team-step";

export default async function TeamStepPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const organization = await currentOrganization(user.id, (await params).slug);
  if (!organization || !canManage(organization.role)) notFound();

  return <TeamStep slug={organization.slug} viewerRole={organization.role} />;
}
