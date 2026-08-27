import type { AppPermission, LocationType, UserRole, UserStatus } from "@e3/shared-types";

export type CmsProfile = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  locationIds: string[];
  lastActiveAt: string | null;
};

export type AuthSuccess = {
  ok: true;
  userId: string;
  email: string;
  profile: CmsProfile;
  permissions: readonly AppPermission[];
};

export type AuthFailureCode = "UNAUTHENTICATED" | "NO_PROFILE" | "DISABLED" | "CONFIG";

export type AuthFailure = {
  ok: false;
  code: AuthFailureCode;
  message: string;
  userId: string | null;
  email: string | null;
};

export type AuthSessionResult = AuthSuccess | AuthFailure;

export type CmsUserRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: UserRole;
  status: UserStatus;
  locationIds: string[];
  lastActiveAt: string | null;
  createdAt: string;
};

export type LocationOption = {
  id: string;
  name: string;
  type: LocationType;
};
