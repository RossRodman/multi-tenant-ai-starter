import { notFound } from "next/navigation";

import { canManage } from "@/lib/roles";
import { getBilling } from "@/server/billing";
import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import { TeamStep } from "./team-step";

export default async function TeamStepPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const organization = await currentOrganization(user.id, (await params).slug);
  if (!organization || !canManage(organization.role)) notFound();

  const { seats } = await getBilling(await getSupabase(), organization.id);
  return <TeamStep slug={organization.slug} viewerRole={organization.role} seats={seats} />;
}
