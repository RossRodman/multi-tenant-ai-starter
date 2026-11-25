import type { UpdateOrganizationError } from "@/server/organizations";
import type { InviteResult } from "@/server/invitations";
import { INVITE_ROWS_MAX } from "@/lib/invitations";
import type { InviteRow } from "@/lib/invitations";
import { NAME_MAX, SLUG_MAX, SLUG_MIN } from "@/lib/slug";

export type InviteFormError = "rate_limited" | "empty" | "too_many" | "forbidden" | "unknown";

export interface InviteFormState {
  error?: InviteFormError;
  results?: { email: string; result: InviteResult }[];
  rows?: InviteRow[];
  submission?: number;
}

export const inviteInitialState: InviteFormState = {};

export const rowsKey = (rows: InviteFormState["rows"]) => JSON.stringify(rows ?? []);

export const inviteErrorMessages: Record<InviteFormError, string> = {
  rate_limited: "Too many invitations. Try again later.",
  empty: "Enter at least one email address.",
  too_many: `You can invite up to ${String(INVITE_ROWS_MAX)} people at a time.`,
  forbidden: "You are not allowed to invite people to this organization.",
  unknown: "Something went wrong. Try again.",
};

export const inviteResultLabels: Record<InviteResult, string> = {
  sent: "Invited",
  not_sent: "Not sent. Resend it from Members.",
  invalid_email: "Invalid email",
  already_member: "Already a member",
  forbidden: "Not allowed",
  unknown: "Something went wrong",
};

export interface SettingsFormState {
  error?: "forbidden" | "unknown";
  fieldError?: string;
  saved?: boolean;
  value?: string;
}

export const settingsInitialState: SettingsFormState = {};

export const settingsFieldMessages: Record<
  Exclude<UpdateOrganizationError, "forbidden" | "unknown">,
  string
> = {
  invalid_name: `Use 1 to ${String(NAME_MAX)} characters, without control or invisible characters.`,
  invalid_slug: `Use ${String(SLUG_MIN)} to ${String(SLUG_MAX)} lowercase letters, numbers and single dashes.`,
  slug_taken: "This slug is already taken.",
};

export const settingsErrorMessages = {
  forbidden: "You are not allowed to change this organization.",
  unknown: "Something went wrong. Try again.",
} as const;

export type MemberStatus =
  | "last_owner"
  | "forbidden"
  | "unknown"
  | "resent"
  | "not_sent"
  | "already_member"
  | "revoked"
  | "rate_limited";

export const memberStatusMessages: Record<
  MemberStatus,
  { text: string; variant: "success" | "destructive" }
> = {
  last_owner: {
    text: "An organization needs at least one owner. Make someone else an owner first.",
    variant: "destructive",
  },
  forbidden: { text: "You are not allowed to do that.", variant: "destructive" },
  unknown: { text: "Something went wrong. Try again.", variant: "destructive" },
  resent: { text: "Invitation sent again.", variant: "success" },
  not_sent: { text: "The email could not be sent. Try again later.", variant: "destructive" },
  already_member: { text: "This person is already a member.", variant: "destructive" },
  revoked: { text: "Invitation revoked.", variant: "success" },
  rate_limited: { text: "Too many invitations. Try again later.", variant: "destructive" },
};

export function isMemberStatus(value: string | undefined): value is MemberStatus {
  return value !== undefined && Object.hasOwn(memberStatusMessages, value);
}
