import type { Database } from "./database.types";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Membership = Database["public"]["Tables"]["memberships"]["Row"];
export type MembershipRole = Database["public"]["Enums"]["membership_role"];
export type Invitation = Database["public"]["Tables"]["invitations"]["Row"];
