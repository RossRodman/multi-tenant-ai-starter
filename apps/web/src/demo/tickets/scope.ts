import "server-only";

import { currentOrganization } from "@/server/organizations";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import type { TicketScope } from "./tickets";

export async function ticketScope(slug: string) {
  const user = await requireUser();
  const organization = await currentOrganization(user.id, slug);
  if (!organization) return null;
  const scope: TicketScope = {
    client: await getSupabase(),
    organizationId: organization.id,
    userId: user.id,
    role: organization.role,
  };
  return { scope, organization };
}
