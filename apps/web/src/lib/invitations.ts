import type { MembershipRole } from "@repo/db";

export const INVITE_ROWS_MAX = 10;
export const EMAIL_MAX = 320;

export interface InviteRow {
  email: string;
  role: MembershipRole;
}
