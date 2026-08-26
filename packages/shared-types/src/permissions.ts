import { USER_ROLES, type UserRole } from "./enums.ts";

/**
 * Canonical permission keys. UI labels stay in the Lovable pages;
 * nav hiding is derived from these, and server functions re-check them.
 */
export const APP_PERMISSIONS = [
  "dashboard.view",
  "locations.view",
  "screens.view",
  "screens.manage",
  "media.view",
  "media.manage",
  "playlists.view",
  "playlists.manage",
  "layouts.view",
  "layouts.manage",
  "campaigns.view",
  "campaigns.manage",
  "campaigns.publish",
  "schedule.view",
  "schedule.manage",
  "reports.view",
  "users.view",
  "users.manage",
  "settings.view",
  "settings.manage",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly AppPermission[] = APP_PERMISSIONS;

export const ROLE_PERMISSIONS: Record<UserRole, readonly AppPermission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  MARKETING: [
    "dashboard.view",
    "locations.view",
    "screens.view",
    "media.view",
    "media.manage",
    "playlists.view",
    "playlists.manage",
    "layouts.view",
    "layouts.manage",
    "campaigns.view",
    "campaigns.manage",
    "campaigns.publish",
    "schedule.view",
    "schedule.manage",
    "reports.view",
  ],
  SITE_SUPERVISOR: [
    "dashboard.view",
    "locations.view",
    "screens.view",
    "screens.manage",
    "schedule.view",
    "schedule.manage",
    "reports.view",
  ],
  EVENT_MANAGER: [
    "dashboard.view",
    "locations.view",
    "screens.view",
    "screens.manage",
    "media.view",
    "media.manage",
    "playlists.view",
    "playlists.manage",
    "layouts.view",
    "campaigns.view",
    "campaigns.manage",
    "campaigns.publish",
    "schedule.view",
    "schedule.manage",
    "reports.view",
  ],
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: UserRole, permission: AppPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRole(role: UserRole): readonly AppPermission[] {
  return ROLE_PERMISSIONS[role];
}

const PATH_PERMISSIONS: ReadonlyArray<{ prefix: string; permission: AppPermission }> = [
  { prefix: "/users", permission: "users.view" },
  { prefix: "/settings", permission: "settings.view" },
  { prefix: "/locations", permission: "locations.view" },
  { prefix: "/screens", permission: "screens.view" },
  { prefix: "/media", permission: "media.view" },
  { prefix: "/playlists", permission: "playlists.view" },
  { prefix: "/layouts", permission: "layouts.view" },
  { prefix: "/campaigns", permission: "campaigns.view" },
  { prefix: "/schedule", permission: "schedule.view" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/dashboard", permission: "dashboard.view" },
];

export function permissionForPath(pathname: string): AppPermission | null {
  const hit = PATH_PERMISSIONS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  return hit?.permission ?? null;
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  const permission = permissionForPath(pathname);
  if (permission === null) return true;
  return hasPermission(role, permission);
}
