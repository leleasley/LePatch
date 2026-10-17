import type { UserRole } from "@prisma/client";

export const roleLabels: Record<UserRole, string> = {
  administrator: "Administrator",
  moderator: "Moderator",
  user: "User",
  restricted: "Restricted",
};

export function isAdministrator(role: UserRole | string | null | undefined): boolean {
  return role === "administrator";
}

export function isModerator(role: UserRole | string | null | undefined): boolean {
  return role === "administrator" || role === "moderator";
}

export function canManageApps(role: UserRole | string | null | undefined): boolean {
  return role === "administrator" || role === "moderator" || role === "user";
}

export function canBrowseApps(role: UserRole | string | null | undefined): boolean {
  return role === "administrator" || role === "moderator" || role === "user" || role === "restricted";
}
