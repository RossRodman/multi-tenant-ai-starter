import "server-only";

import type { MembershipRole } from "@repo/db";

import { APP_NAME } from "@/lib/brand";
import { roleLabel } from "@/lib/roles";

import { emailLayout, escapeHtml } from "./layout";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" });

export interface InvitationEmailInput {
  organizationName: string;
  inviterEmail: string;
  role: MembershipRole;
  url: string;
  expiresAt: Date;
}

export function invitationEmail({
  organizationName,
  inviterEmail,
  role,
  url,
  expiresAt,
}: InvitationEmailInput) {
  const expires = `${dateFormat.format(expiresAt)} (UTC)`;
  const subject = `${inviterEmail} invited you to ${organizationName}`;

  const text = [
    `${inviterEmail} invited you to join ${organizationName} as ${roleLabel(role)}.`,
    "",
    `Open the invitation: ${url}`,
    "",
    `Sign in or create an account with this email address to accept. The invitation expires on ${expires}. If you were not expecting it, you can ignore this email.`,
  ].join("\n");

  const html = emailLayout({
    appName: APP_NAME,
    title: `Join ${escapeHtml(organizationName)}`,
    intro: `<strong>${escapeHtml(inviterEmail)}</strong> invited you to join <strong>${escapeHtml(organizationName)}</strong> as ${roleLabel(role)}.`,
    button: { label: "Open the invitation", url },
    footer: `Sign in or create an account with this email address to accept. The invitation expires on ${escapeHtml(expires)}. If you were not expecting it, you can ignore this email.`,
  });

  return { subject, text, html };
}

export function invitationUrl(appUrl: string, invitationId: string) {
  const url = new URL("/app", appUrl);
  url.searchParams.set("invitation", invitationId);
  return url.toString();
}
