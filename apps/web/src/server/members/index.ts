import "server-only";

import type { Client, MembershipRole } from "@repo/db";

import { displayNameSchema } from "../display-name";
import { INSUFFICIENT_PRIVILEGE } from "../pg-errors";

export type MemberError = "last_owner" | "forbidden" | "unknown";

type MemberResult = { ok: true } | { ok: false; error: MemberError };

const LAST_OWNER = "OW001";

export async function listMembers(client: Client, organizationId: string) {
  const { data, error } = await client.rpc("organization_members", {
    organization_id: organizationId,
  });
  if (error) throw new Error("Could not list members", { cause: error });
  return data.map((member) => ({
    userId: member.user_id,
    email: member.email,
    name: displayNameSchema.safeParse(member.name).data ?? null,
    role: member.role,
    joinedAt: member.joined_at,
  }));
}

function outcome(
  rows: unknown[] | null,
  error: { code: string; message: string } | null,
): MemberResult {
  if (error) {
    if (error.code === LAST_OWNER) return { ok: false, error: "last_owner" };
    if (error.code === INSUFFICIENT_PRIVILEGE) return { ok: false, error: "forbidden" };
    console.error("Unexpected membership error", { code: error.code, message: error.message });
    return { ok: false, error: "unknown" };
  }
  return rows?.length ? { ok: true } : { ok: false, error: "forbidden" };
}

export async function changeRole(
  client: Client,
  organizationId: string,
  userId: string,
  role: MembershipRole,
): Promise<MemberResult> {
  const { data, error } = await client
    .from("memberships")
    .update({ role })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .select("user_id");
  return outcome(data, error);
}

export async function removeMember(
  client: Client,
  organizationId: string,
  userId: string,
): Promise<MemberResult> {
  const { data, error } = await client
    .from("memberships")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .select("user_id");
  return outcome(data, error);
}
