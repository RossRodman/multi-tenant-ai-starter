import type { MembershipRole } from "@repo/db";

export const ROLES: MembershipRole[] = ["member", "admin", "owner"];

export const canManage = (role: MembershipRole) => role !== "member";

export const roleLabel = (role: MembershipRole) => role.charAt(0).toUpperCase() + role.slice(1);

export const canManageRole = (viewer: MembershipRole, target: MembershipRole) =>
  viewer === "owner" || (viewer === "admin" && target !== "owner");

export const assignableRoles = (viewer: MembershipRole) =>
  ROLES.filter((role) => viewer === "owner" || role !== "owner");
