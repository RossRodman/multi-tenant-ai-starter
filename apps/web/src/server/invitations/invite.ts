import "server-only";

import type { Client, MembershipRole } from "@repo/db";

import { EMAIL_MAX } from "@/lib/invitations";
import type { InviteRow } from "@/lib/invitations";

import { emailSchema } from "../auth";
import { getServerEnv } from "../env";
import { invitationEmail, invitationUrl, sendMail } from "../mail";
import { listMembers } from "../members";
import { INSUFFICIENT_PRIVILEGE, UNIQUE_VIOLATION } from "../pg-errors";

export type InviteResult =
  "sent" | "not_sent" | "invalid_email" | "already_member" | "forbidden" | "unknown";

interface Created {
  id: string;
  expiresAt: Date;
}

async function createInvitation(
  client: Client,
  organizationId: string,
  { email, role }: InviteRow,
): Promise<{ created: Created } | { result: InviteResult }> {
  const insert = () =>
    client
      .from("invitations")
      .insert({ organization_id: organizationId, email, role })
      .select("id, expires_at")
      .single();

  let attempt = await insert();
  if (attempt.error?.code === UNIQUE_VIOLATION) {
    const removed = await client
      .from("invitations")
      .delete()
      .eq("organization_id", organizationId)
      .eq("email", email)
      .is("accepted_at", null)
      .select("id");
    if (removed.error) return { result: "unknown" };
    if (removed.data.length === 0) return { result: "forbidden" };
    attempt = await insert();
  }

  const { data, error } = attempt;
  if (error?.code === UNIQUE_VIOLATION) return { result: "sent" };
  if (error) {
    if (error.code === INSUFFICIENT_PRIVILEGE) return { result: "forbidden" };
    console.error("Unexpected invitation error", { code: error.code, message: error.message });
    return { result: "unknown" };
  }
  return { created: { id: data.id, expiresAt: new Date(data.expires_at) } };
}

export async function inviteMembers(
  client: Client,
  organization: { id: string; name: string },
  inviter: { email: string },
  rows: InviteRow[],
): Promise<{ email: string; result: InviteResult }[]> {
  const members = new Set(
    (await listMembers(client, organization.id)).map((member) => member.email.toLowerCase()),
  );
  const appUrl = getServerEnv().appUrl;

  const outcomes = new Map<string, InviteResult>();
  const toSend: { email: string; role: MembershipRole; created: Created }[] = [];
  const normalized = rows.map(({ email }) => {
    const parsed = emailSchema.safeParse(email);
    return parsed.success && parsed.data.length <= EMAIL_MAX ? parsed.data : null;
  });

  for (const [index, row] of rows.entries()) {
    const email = normalized[index];
    if (email == null || outcomes.has(email)) continue;
    if (members.has(email)) {
      outcomes.set(email, "already_member");
      continue;
    }
    const made = await createInvitation(client, organization.id, { email, role: row.role });
    if ("created" in made) {
      outcomes.set(email, "sent");
      toSend.push({ email, role: row.role, created: made.created });
    } else {
      outcomes.set(email, made.result);
    }
  }

  await Promise.all(
    toSend.map(async ({ email, role, created }) => {
      const message = invitationEmail({
        organizationName: organization.name,
        inviterEmail: inviter.email,
        role,
        url: invitationUrl(appUrl, created.id),
        expiresAt: created.expiresAt,
      });
      if (!(await sendMail({ to: email, ...message })).ok) outcomes.set(email, "not_sent");
    }),
  );

  return rows.map((row, index) => {
    const email = normalized[index];
    return {
      email: row.email.trim(),
      result: email == null ? "invalid_email" : (outcomes.get(email) ?? "unknown"),
    };
  });
}
