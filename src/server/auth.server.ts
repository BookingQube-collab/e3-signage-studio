import {
  EVENT_LOCATION_TYPES,
  hasPermission,
  isUserRole,
  LOCATION_TYPES,
  permissionsForRole,
  type AppPermission,
  type LocationType,
  type UserRole,
  type UserStatus,
} from "@e3/shared-types";

import type {
  AuthFailure,
  AuthSessionResult,
  CmsProfile,
  CmsUserRow,
  LocationOption,
} from "@/lib/auth-types";
import {
  isProtectedSuperAdminEmail,
  requiresLocationAssignment,
} from "@/lib/location-scope";
import { clearAuthCookies, readAuthCookies, setAuthCookies } from "./session-cookies.server";
import { ensureSeedLocations } from "./location-seed.server";
import { getServiceRoleClient, getUserClient } from "./supabase.server";

const MESSAGES: Record<Exclude<AuthFailure["code"], "UNAUTHENTICATED">, string> = {
  NO_PROFILE: "No CMS profile is linked to this account. Contact a Super Admin.",
  DISABLED: "This account has been disabled. Contact a Super Admin.",
  CONFIG: "Authentication is not configured. Check Supabase environment variables.",
};

function fail(
  code: AuthFailure["code"],
  extra: { userId: string | null; email: string | null },
): AuthFailure {
  const message = code === "UNAUTHENTICATED" ? "Sign in to continue." : MESSAGES[code];
  return { ok: false, code, message, userId: extra.userId, email: extra.email };
}

function isUserStatus(value: string): value is UserStatus {
  return value === "ACTIVE" || value === "INVITED" || value === "DISABLED";
}

function isLocationType(value: string): value is LocationType {
  return (LOCATION_TYPES as readonly string[]).includes(value);
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function parseLocationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function parseProfile(raw: unknown): CmsProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = row["id"];
  const organizationId = row["organizationId"];
  const name = row["name"];
  const email = row["email"];
  const role = row["role"];
  const status = row["status"];
  if (typeof id !== "string" || typeof organizationId !== "string") return null;
  if (typeof name !== "string" || typeof email !== "string") return null;
  if (typeof role !== "string" || !isUserRole(role)) return null;
  if (typeof status !== "string" || !isUserStatus(status)) return null;
  return {
    id,
    organizationId,
    name,
    email,
    role,
    status,
    locationIds: parseLocationIds(row["locationIds"]),
    lastActiveAt: asIso(row["lastActiveAt"]),
  };
}

type DbUser = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  last_active_at: string | null;
  created_at: string;
};

function toCmsUserRow(row: DbUser, locationIds: string[]): CmsUserRow | null {
  if (!isUserRole(row.role) || !isUserStatus(row.status)) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    locationIds,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
  };
}

export function persistAuthCookies(accessToken: string, refreshToken: string): { ok: true } {
  setAuthCookies(accessToken, refreshToken);
  return { ok: true };
}

export function clearAuthSession(): { ok: true } {
  clearAuthCookies();
  return { ok: true };
}

export async function resolveAuthFromRequest(
  accessTokenFromClient: string,
): Promise<AuthSessionResult> {
  const cookies = readAuthCookies();
  const accessToken = accessTokenFromClient || cookies?.accessToken || "";
  const refreshToken = cookies?.refreshToken ?? "";

  if (!accessToken && !refreshToken) {
    return fail("UNAUTHENTICATED", { userId: null, email: null });
  }

  try {
    const client = getUserClient(accessToken);
    if (refreshToken) {
      const { data: refreshed, error: refreshError } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!refreshError && refreshed.session) {
        setAuthCookies(refreshed.session.access_token, refreshed.session.refresh_token);
      }
    }

    const { data: userData, error: userError } = await client.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return fail("UNAUTHENTICATED", { userId: null, email: null });
    }

    const userId = userData.user.id;
    const email = userData.user.email ?? null;

    const { data: rpcData, error: rpcError } = await client.rpc("resolve_cms_profile");
    if (rpcError) {
      return {
        ok: false,
        code: "CONFIG",
        message: rpcError.message,
        userId,
        email,
      };
    }

    const payload = rpcData as { ok?: boolean; code?: string; profile?: unknown } | null;
    if (!payload || payload.ok !== true) {
      const code = payload?.code;
      if (code === "DISABLED") return fail("DISABLED", { userId, email });
      if (code === "NO_PROFILE") return fail("NO_PROFILE", { userId, email });
      if (code === "UNAUTHENTICATED") return fail("UNAUTHENTICATED", { userId: null, email: null });
      return fail("NO_PROFILE", { userId, email });
    }

    const profile = parseProfile(payload.profile);
    if (!profile) return fail("NO_PROFILE", { userId, email });

    return {
      ok: true,
      userId,
      email: email ?? profile.email,
      profile,
      permissions: permissionsForRole(profile.role),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    if (message.includes("not configured")) {
      return fail("CONFIG", { userId: null, email: null });
    }
    return fail("UNAUTHENTICATED", { userId: null, email: null });
  }
}

export async function requireCmsPermission(
  accessToken: string,
  permission: AppPermission,
): Promise<Extract<AuthSessionResult, { ok: true }>> {
  const auth = await resolveAuthFromRequest(accessToken);
  if (!auth.ok) {
    throw new Error(auth.message);
  }
  if (!hasPermission(auth.profile.role, permission)) {
    throw new Error("Permission denied.");
  }
  return auth;
}

export async function listCmsUsers(accessToken: string): Promise<CmsUserRow[]> {
  await requireCmsPermission(accessToken, "users.view");
  const client = getUserClient(accessToken);
  const { data: users, error } = await client
    .from("users")
    .select("id, organization_id, name, email, role, status, last_active_at, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: accessRows, error: accessError } = await client
    .from("user_location_access")
    .select("user_id, location_id");
  if (accessError) throw new Error(accessError.message);

  const byUser = new Map<string, string[]>();
  for (const row of accessRows ?? []) {
    const userId = (row as { user_id: string }).user_id;
    const locationId = (row as { location_id: string }).location_id;
    const list = byUser.get(userId) ?? [];
    list.push(locationId);
    byUser.set(userId, list);
  }

  const out: CmsUserRow[] = [];
  for (const row of (users ?? []) as DbUser[]) {
    const mapped = toCmsUserRow(row, byUser.get(row.id) ?? []);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function listLocationOptions(accessToken: string): Promise<LocationOption[]> {
  const auth = await resolveAuthFromRequest(accessToken);
  if (!auth.ok) throw new Error(auth.message);
  if (auth.profile.role === "SUPER_ADMIN") {
    try {
      await ensureSeedLocations(auth.profile.organizationId);
    } catch {
      // Users page should still load if seed cannot run.
    }
  }
  const client = getUserClient(accessToken);
  const { data, error } = await client.from("locations").select("id, name, type").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const type = (row as { type: string }).type;
    if (!isLocationType(type)) return [];
    return [
      {
        id: (row as { id: string }).id,
        name: (row as { name: string }).name,
        type,
      },
    ];
  });
}

function randomPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `E3-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function assertLocationAssignment(role: UserRole, locationIds: string[]): void {
  if (requiresLocationAssignment(role) && locationIds.length === 0) {
    throw new Error("Assign at least one location to this role.");
  }
}

export async function inviteCmsUser(input: {
  accessToken: string;
  name: string;
  email: string;
  role: UserRole;
  locationIds: string[];
}): Promise<{ user: CmsUserRow; inviteSent: boolean; warning: string | null }> {
  const auth = await requireCmsPermission(input.accessToken, "users.manage");
  assertLocationAssignment(input.role, input.locationIds);
  if (input.role === "EVENT_MANAGER") {
    await assertEventLocations(input.locationIds);
  }

  const admin = getServiceRoleClient();
  let authUserId: string | null = null;
  let inviteSent = false;
  let warning: string | null = null;

  const invited = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { name: input.name },
  });

  if (!invited.error && invited.data.user) {
    authUserId = invited.data.user.id;
    inviteSent = true;
  } else {
    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    if (created.error || !created.data.user) {
      throw new Error(
        invited.error?.message ??
          created.error?.message ??
          "Could not create the Auth user. Check the service role key.",
      );
    }
    authUserId = created.data.user.id;
    warning = "Invite email could not be sent. Ask them to use Forgot password on the login page.";
  }

  const { data: inserted, error: insertError } = await admin
    .from("users")
    .insert({
      id: authUserId,
      organization_id: auth.profile.organizationId,
      name: input.name,
      email: input.email,
      role: input.role,
      status: "INVITED",
      created_by: auth.userId,
    })
    .select("id, organization_id, name, email, role, status, last_active_at, created_at")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not create the CMS user profile.");
  }

  if (input.locationIds.length > 0) {
    const { error: locError } = await admin.from("user_location_access").insert(
      input.locationIds.map((locationId) => ({
        user_id: authUserId,
        location_id: locationId,
        created_by: auth.userId,
      })),
    );
    if (locError) {
      warning = [warning, locError.message].filter(Boolean).join(" ");
    }
  }

  const user = toCmsUserRow(inserted as DbUser, input.locationIds);
  if (!user) throw new Error("Created user had an unexpected role or status.");
  return { user, inviteSent, warning };
}

export async function updateCmsUser(input: {
  accessToken: string;
  userId: string;
  role: UserRole;
  locationIds: string[];
}): Promise<CmsUserRow> {
  await requireCmsPermission(input.accessToken, "users.manage");
  assertLocationAssignment(input.role, input.locationIds);
  if (input.role === "EVENT_MANAGER") {
    await assertEventLocations(input.locationIds);
  }

  const admin = getServiceRoleClient();
  const { data: existing, error: existingError } = await admin
    .from("users")
    .select("id, email, role")
    .eq("id", input.userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("User not found.");
  const existingEmail = (existing as { email: string }).email;
  if (isProtectedSuperAdminEmail(existingEmail) && input.role !== "SUPER_ADMIN") {
    throw new Error("This Super Admin account cannot be changed to another role.");
  }

  const { data: updated, error } = await admin
    .from("users")
    .update({ role: input.role })
    .eq("id", input.userId)
    .select("id, organization_id, name, email, role, status, last_active_at, created_at")
    .single();
  if (error || !updated) {
    throw new Error(error?.message ?? "Could not update the user.");
  }

  const { error: delError } = await admin
    .from("user_location_access")
    .delete()
    .eq("user_id", input.userId);
  if (delError) throw new Error(delError.message);

  if (input.locationIds.length > 0) {
    const auth = await resolveAuthFromRequest(input.accessToken);
    const createdBy = auth.ok ? auth.userId : null;
    const { error: insError } = await admin.from("user_location_access").insert(
      input.locationIds.map((locationId) => ({
        user_id: input.userId,
        location_id: locationId,
        created_by: createdBy,
      })),
    );
    if (insError) throw new Error(insError.message);
  }

  const user = toCmsUserRow(updated as DbUser, input.locationIds);
  if (!user) throw new Error("Updated user had an unexpected role or status.");
  return user;
}

async function assertEventLocations(locationIds: string[]): Promise<void> {
  if (locationIds.length === 0) return;
  const admin = getServiceRoleClient();
  const { data, error } = await admin.from("locations").select("id, type").in("id", locationIds);
  if (error) throw new Error(error.message);
  const allowed = new Set<string>(EVENT_LOCATION_TYPES);
  const invalid = (data ?? []).filter((row) => {
    const type = (row as { type: string }).type;
    return !allowed.has(type);
  });
  if (invalid.length > 0) {
    throw new Error("Event Managers can only be assigned to temporary/event locations.");
  }
}
