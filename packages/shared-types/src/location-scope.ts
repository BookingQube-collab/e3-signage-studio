import { EVENT_LOCATION_TYPES, type UserRole } from "./enums.ts";

export const NO_LOCATION_ACCESS_MESSAGE = "No access to this location.";

export const PROTECTED_SUPER_ADMIN_EMAIL = "rajan@e3.qa";

export const ORG_WIDE_ROLES: readonly UserRole[] = ["SUPER_ADMIN", "MARKETING"];

export const LOCATION_SCOPED_ROLES: readonly UserRole[] = ["SITE_SUPERVISOR", "EVENT_MANAGER"];

export type LocationScopeProfile = {
  id: string;
  role: UserRole;
  locationIds: readonly string[];
};

export function isOrgWideRole(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "MARKETING";
}

export function isLocationScopedRole(role: UserRole): boolean {
  return role === "SITE_SUPERVISOR" || role === "EVENT_MANAGER";
}

export function isProtectedSuperAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === PROTECTED_SUPER_ADMIN_EMAIL;
}

export function requiresLocationAssignment(role: UserRole): boolean {
  return isLocationScopedRole(role);
}

export function canAccessLocationId(profile: LocationScopeProfile, locationId: string): boolean {
  if (isOrgWideRole(profile.role)) return true;
  return profile.locationIds.includes(locationId);
}

export function assertLocationAccess(profile: LocationScopeProfile, locationId: string): void {
  if (!canAccessLocationId(profile, locationId)) {
    throw new Error(NO_LOCATION_ACCESS_MESSAGE);
  }
}

export function assertScreenLocationAccess(
  profile: LocationScopeProfile,
  locationId: string,
  locationType: string,
): void {
  assertLocationAccess(profile, locationId);
  if (profile.role === "EVENT_MANAGER") {
    const allowed = new Set<string>(EVENT_LOCATION_TYPES);
    if (!allowed.has(locationType)) {
      throw new Error("Event Managers can only access temporary/event locations.");
    }
  }
}

export function filterLocationsByScope<T extends { id: string }>(
  profile: LocationScopeProfile,
  locations: readonly T[],
): T[] {
  if (isOrgWideRole(profile.role)) return [...locations];
  const allowed = new Set(profile.locationIds);
  return locations.filter((location) => allowed.has(location.id));
}

export function filterScreensByScope<T extends { locationId: string }>(
  profile: LocationScopeProfile,
  screens: readonly T[],
): T[] {
  if (isOrgWideRole(profile.role)) return [...screens];
  const allowed = new Set(profile.locationIds);
  return screens.filter((screen) => allowed.has(screen.locationId));
}

export function campaignVisibleToProfile(
  profile: LocationScopeProfile,
  screenLocationIds: readonly string[],
  createdBy: string | null,
): boolean {
  if (isOrgWideRole(profile.role)) return true;
  if (screenLocationIds.some((locationId) => profile.locationIds.includes(locationId))) {
    return true;
  }
  return screenLocationIds.length === 0 && createdBy === profile.id;
}

export function campaignEditableByProfile(
  profile: LocationScopeProfile,
  screenLocationIds: readonly string[],
  createdBy: string | null,
): boolean {
  if (isOrgWideRole(profile.role)) return true;
  if (createdBy === profile.id) return true;
  if (screenLocationIds.length === 0) return false;
  return screenLocationIds.every((locationId) => profile.locationIds.includes(locationId));
}

export function contentVisibleToProfile(
  profile: LocationScopeProfile,
  createdBy: string | null,
  usedAtAssignedLocation: boolean,
): boolean {
  if (isOrgWideRole(profile.role)) return true;
  if (createdBy === profile.id) return true;
  return usedAtAssignedLocation;
}

export function mediaVisibleToProfile(
  profile: LocationScopeProfile,
  media: {
    createdBy: string | null;
    uploadedBy?: string | null;
    locationIds: readonly string[];
  },
  usedAtAssignedLocation: boolean,
): boolean {
  if (isOrgWideRole(profile.role)) return true;
  if (media.createdBy === profile.id || media.uploadedBy === profile.id) return true;
  if (media.locationIds.some((locationId) => profile.locationIds.includes(locationId))) {
    return true;
  }
  return usedAtAssignedLocation;
}

export function canMutateOwnedContent(
  profile: LocationScopeProfile,
  createdBy: string | null,
): boolean {
  if (isOrgWideRole(profile.role)) return true;
  return createdBy === profile.id;
}

export function assertCanMutateOwnedContent(
  profile: LocationScopeProfile,
  createdBy: string | null,
): void {
  if (!canMutateOwnedContent(profile, createdBy)) {
    throw new Error(NO_LOCATION_ACCESS_MESSAGE);
  }
}

export function locationIdsForNewMedia(profile: LocationScopeProfile): string[] {
  if (!isLocationScopedRole(profile.role)) return [];
  return [...profile.locationIds];
}
