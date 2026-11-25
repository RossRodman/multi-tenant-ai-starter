import "server-only";

import type { Client, MembershipRole } from "@repo/db";

import { inviteMembers } from "./invite";
import type { InviteResult } from "./invite";

const NOT_AVAILABLE = "IV001";

export interface PendingInvitation {
  id: string;
  email: string;
  role: MembershipRole;
  invitedByEmail: string;
  expiresAt: string;
}

export interface MyInvitation {
  id: string;
  role: MembershipRole;
  invitedByEmail: string;
  expiresAt: string;
  organization: { name: string; slug: string };
}

export async function listPendingInvitations(
  client: Client,
  organizationId: string,
): Promise<PendingInvitation[]> {
  const { data, error } = await client
    .from("invitations")
    .select("id, email, role, invited_by_email, expires_at")
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not list invitations", { cause: error });

  return data.map(({ invited_by_email, expires_at, ...invitation }) => ({
    ...invitation,
    invitedByEmail: invited_by_email,
    expiresAt: expires_at,
  }));
}

export async function listMyInvitations(client: Client, email: string): Promise<MyInvitation[]> {
  const { data, error } = await client
    .from("invitations")
    .select("id, role, invited_by_email, expires_at, organizations(name, slug)")
    .eq("email", email.toLowerCase())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not list invitations", { cause: error });

  return data.map(({ organizations, invited_by_email, expires_at, ...invitation }) => ({
    ...invitation,
    invitedByEmail: invited_by_email,
    expiresAt: expires_at,
    organization: organizations,
  }));
}

export async function acceptInvitation(
  client: Client,
  id: string,
): Promise<{ ok: true; slug: string } | { ok: false; error: "not_available" | "unknown" }> {
  const { data, error } = await client.rpc("accept_invitation", { invitation_id: id });
  if (error) {
    if (error.code === NOT_AVAILABLE) return { ok: false, error: "not_available" };
    console.error("Unexpected invitation error", { code: error.code, message: error.message });
    return { ok: false, error: "unknown" };
  }
  return { ok: true, slug: data };
}

export async function revokeInvitation(
  client: Client,
  organizationId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "unknown" }> {
  const { data, error } = await client
    .from("invitations")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) {
    console.error("Unexpected invitation error", { code: error.code, message: error.message });
    return { ok: false, error: "unknown" };
  }
  return data.length > 0 ? { ok: true } : { ok: false, error: "forbidden" };
}

export async function resendInvitation(
  client: Client,
  organization: { id: string; name: string },
  inviter: { email: string },
  id: string,
): Promise<InviteResult> {
  const { data, error } = await client
    .from("invitations")
    .select("email, role")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .is("accepted_at", null)
    .maybeSingle();
  if (error) return "unknown";
  if (!data) return "forbidden";

  const [outcome] = await inviteMembers(client, organization, inviter, [data]);
  return outcome?.result ?? "unknown";
}
