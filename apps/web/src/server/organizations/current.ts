import "server-only";

import { cache } from "react";

import { getSupabase } from "../supabase/client";
import { getOrganization } from "./get";

export const currentOrganization = cache(async (userId: string, slug: string) =>
  getOrganization(await getSupabase(), userId, slug),
);
