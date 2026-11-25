"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { text } from "@/lib/form";
import { INVITE_ROWS_MAX } from "@/lib/invitations";
import type { InviteRow } from "@/lib/invitations";
import { ROLES, canManage } from "@/lib/roles";
import { isSlug } from "@/lib/slug";
import { inviteMembers, resendInvitation, revokeInvitation } from "@/server/invitations";
import type { InviteResult } from "@/server/invitations";
import { changeRole, removeMember } from "@/server/members";
import { getOrganization, rememberOrganization, updateOrganization } from "@/server/organizations";
import { inviteLimiter } from "@/server/rate-limit";
import { requireUser } from "@/server/session";
import { getSupabase } from "@/server/supabase/client";

import type { InviteFormState, MemberStatus, SettingsFormState } from "./form-state";
import { settingsFieldMessages } from "./form-state";

const roleSchema = z.enum(ROLES);
const uuidSchema = z.uuid();
const slugSchema = z.string().refine(isSlug);

function slugOf(formData: FormData) {
  const slug = slugSchema.safeParse(text(formData, "slug"));
  if (!slug.success) redirect("/app");
  return slug.data;
}

async function context(formData: FormData) {
  const user = await requireUser();
  const client = await getSupabase();
  const organization = await getOrganization(client, user.id, slugOf(formData));
  return { user, client, organization };
}

const RESEND_STATUS: Partial<Record<InviteResult, MemberStatus>> = {
  sent: "resent",
  not_sent: "not_sent",
  already_member: "already_member",
  forbidden: "forbidden",
};

const membersPath = (slug: string) => `/o/${slug}/members` as Route;

function backToMembers(slug: string, status?: MemberStatus, tab?: "invitations"): never {
  revalidatePath(membersPath(slug));
  const query = new URLSearchParams();
  if (tab) query.set("tab", tab);
  if (status) query.set("status", status);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`${membersPath(slug)}${suffix}` as Route);
}

export async function inviteMembersAction(
  prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const user = await requireUser();

  const emails = formData.getAll("email");
  const roles = formData.getAll("role");
  const rows: InviteRow[] = [];
  for (const [index, value] of emails.entries()) {
    const email = typeof value === "string" ? value.trim() : "";
    if (email === "") continue;
    const role = roleSchema.safeParse(roles[index]);
    if (!role.success) return { error: "unknown" };
    rows.push({ email, role: role.data });
  }

  if (rows.length === 0) return { error: "empty", rows };
  if (rows.length > INVITE_ROWS_MAX) return { error: "too_many", rows };
  if (!inviteLimiter.take(user.id, rows.length).ok) return { error: "rate_limited", rows };

  const client = await getSupabase();
  const organization = await getOrganization(client, user.id, slugOf(formData));
  if (!organization || !canManage(organization.role) || !user.email) {
    return { error: "forbidden", rows };
  }

  const results = await inviteMembers(client, organization, { email: user.email }, rows);
  revalidatePath(membersPath(organization.slug));
  return { results, submission: (prev.submission ?? 0) + 1 };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const { client, organization } = await context(formData);
  const id = uuidSchema.safeParse(text(formData, "id"));
  if (!organization || !id.success) {
    return backToMembers(slugOf(formData), "forbidden", "invitations");
  }

  const result = await revokeInvitation(client, organization.id, id.data);
  backToMembers(organization.slug, result.ok ? "revoked" : result.error, "invitations");
}

export async function resendInvitationAction(formData: FormData): Promise<void> {
  const slug = slugOf(formData);
  const user = await requireUser();
  if (!inviteLimiter.take(user.id, 1).ok) {
    return backToMembers(slug, "rate_limited", "invitations");
  }

  const client = await getSupabase();
  const organization = await getOrganization(client, user.id, slug);
  const id = uuidSchema.safeParse(text(formData, "id"));
  if (!organization || !id.success || !user.email) {
    return backToMembers(slug, "forbidden", "invitations");
  }

  const result = await resendInvitation(client, organization, { email: user.email }, id.data);
  const status: MemberStatus = RESEND_STATUS[result] ?? "unknown";
  backToMembers(organization.slug, status, "invitations");
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const { client, organization } = await context(formData);
  const userId = uuidSchema.safeParse(text(formData, "user_id"));
  const role = roleSchema.safeParse(text(formData, "role"));
  if (!organization || !userId.success || !role.success) {
    return backToMembers(slugOf(formData), "forbidden");
  }

  const result = await changeRole(client, organization.id, userId.data, role.data);
  backToMembers(organization.slug, result.ok ? undefined : result.error);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { client, organization } = await context(formData);
  const userId = uuidSchema.safeParse(text(formData, "user_id"));
  if (!organization || !userId.success) return backToMembers(slugOf(formData), "forbidden");

  const result = await removeMember(client, organization.id, userId.data);
  backToMembers(organization.slug, result.ok ? undefined : result.error);
}

export async function leaveOrganizationAction(formData: FormData): Promise<void> {
  const { user, client, organization } = await context(formData);
  if (!organization) redirect("/app");

  const result = await removeMember(client, organization.id, user.id);
  if (!result.ok) return backToMembers(organization.slug, result.error);
  revalidatePath("/app");
  redirect("/app");
}

async function settingsChange(
  formData: FormData,
  field: "name" | "slug",
): Promise<SettingsFormState> {
  const { client, organization } = await context(formData);
  const value = text(formData, field === "slug" ? "new_slug" : "name");
  if (!organization || !canManage(organization.role)) return { error: "forbidden", value };

  const result = await updateOrganization(
    client,
    organization.id,
    field === "name" ? { name: value } : { slug: value },
  );
  if (result.ok) {
    revalidatePath(`/o/${organization.slug}`, "layout");
    if (field === "slug") {
      await rememberOrganization(result.slug);
      redirect(`/o/${result.slug}/settings` as Route);
    }
    return { saved: true, value };
  }
  switch (result.error) {
    case "invalid_name":
    case "invalid_slug":
    case "slug_taken":
      return { fieldError: settingsFieldMessages[result.error], value };
    case "forbidden":
    case "unknown":
      return { error: result.error, value };
  }
}

export async function renameOrganizationAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return settingsChange(formData, "name");
}

export async function changeSlugAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return settingsChange(formData, "slug");
}
