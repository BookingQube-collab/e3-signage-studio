import {
  DEVICE_SYNC_STATES,
  LOCATION_STATUSES,
  LOCATION_TYPES,
  ORIENTATIONS,
  SCREEN_OPERATIONAL_STATUSES,
  type DeviceSyncState,
  type LocationStatus,
  type LocationType,
  type Orientation,
  type ScreenOperationalStatus,
} from "@e3/shared-types";

import { connectivityFromHeartbeat, DEFAULT_OFFLINE_AFTER_SECONDS } from "@/lib/connectivity";
import { hashPairingCode } from "@/lib/device-crypto";
import { assertPairingCodeDigits, pairingCodeLinkError } from "@/lib/pairing-code";

import type { CmsProfile } from "@/lib/auth-types";
import {
  assertLocationAccess,
  assertScreenLocationAccess,
  filterLocationsByScope,
  filterScreensByScope,
} from "@/lib/location-scope";
import type { LocationRecord, ScreenGroupRecord, ScreenRecord } from "@/services/inventory-map";
import { requireCmsPermission, resolveAuthFromRequest } from "./auth.server";
import { ensureSeedLocations } from "./location-seed.server";
import { getServiceRoleClient, getUserClient } from "./supabase.server";

const PENDING_PAIR_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type AuthOk = Extract<Awaited<ReturnType<typeof resolveAuthFromRequest>>, { ok: true }>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isLocationType(value: string): value is LocationType {
  return (LOCATION_TYPES as readonly string[]).includes(value);
}

function isLocationStatus(value: string): value is LocationStatus {
  return (LOCATION_STATUSES as readonly string[]).includes(value);
}

function isOrientation(value: string): value is Orientation {
  return (ORIENTATIONS as readonly string[]).includes(value);
}

function isOperationalStatus(value: string): value is ScreenOperationalStatus {
  return (SCREEN_OPERATIONAL_STATUSES as readonly string[]).includes(value);
}

function isSyncState(value: string): value is DeviceSyncState {
  return (DEVICE_SYNC_STATES as readonly string[]).includes(value);
}

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function locationCodeFromName(name: string): string {
  const code = name
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 40);
  return code.length > 0 ? code : "LOC";
}

function parseResolution(
  resolution: string,
  orientation: Orientation,
): { width: number; height: number } {
  const nums = resolution.match(/\d+/g);
  const first = nums?.[0];
  const second = nums?.[1];
  if (first && second) {
    const width = Number(first);
    const height = Number(second);
    if (width > 0 && height > 0) return { width, height };
  }
  return orientation === "PORTRAIT" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

function connectivityOf(
  operationalStatus: string,
  lastHeartbeatAt: string | null,
  offlineAfterSeconds: number,
): ScreenRecord["connectivity"] {
  return connectivityFromHeartbeat(operationalStatus, lastHeartbeatAt, offlineAfterSeconds);
}

function assertAssignedLocation(
  profile: CmsProfile,
  locationId: string,
  locationType: string,
): void {
  assertScreenLocationAccess(profile, locationId, locationType);
}

type PairingCodeRow = {
  id: string;
  expires_at: string;
  consumed_at: string | null;
  screen_id: string | null;
};

async function requireScreenLocation(
  accessToken: string,
  auth: { profile: CmsProfile },
  current: ScreenRecord,
): Promise<void> {
  const client = getUserClient(accessToken);
  const { data: location, error: locError } = await client
    .from("locations")
    .select("type")
    .eq("id", current.locationId)
    .maybeSingle();
  throwIfError(locError, "Could not load location.");
  assertAssignedLocation(
    auth.profile,
    current.locationId,
    asString((location as { type?: string } | null)?.type),
  );
}

async function lookupPairingCode(
  admin: ReturnType<typeof getServiceRoleClient>,
  digits: string,
): Promise<PairingCodeRow | null> {
  const { data, error } = await admin
    .from("device_pairing_codes")
    .select("id, expires_at, consumed_at, screen_id")
    .eq("code_hash", hashPairingCode(digits))
    .maybeSingle();
  throwIfError(error, "Could not look up pairing code.");
  return (data as PairingCodeRow | null) ?? null;
}

async function attachPairingCodeToScreen(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
  screenId: string,
  digits: string,
  existing: PairingCodeRow | null,
): Promise<void> {
  if (existing) {
    const linkErrorMessage = pairingCodeLinkError(
      {
        expiresAt: existing.expires_at,
        consumedAt: existing.consumed_at,
        screenId: existing.screen_id,
      },
      screenId,
    );
    if (linkErrorMessage) throw new Error(linkErrorMessage);
    const { error: linkError } = await admin
      .from("device_pairing_codes")
      .update({
        screen_id: screenId,
        organization_id: organizationId,
      })
      .eq("id", existing.id);
    throwIfError(linkError, "Could not link the pairing code.");
    return;
  }

  const { error: pendingError } = await admin.from("device_pairing_codes").insert({
    organization_id: organizationId,
    code_hash: hashPairingCode(digits),
    expires_at: new Date(Date.now() + PENDING_PAIR_TTL_MS).toISOString(),
    screen_id: screenId,
  });
  throwIfError(pendingError, "Could not store the pairing code.");
}

async function maybeSeed(auth: AuthOk): Promise<void> {
  if (auth.profile.role !== "SUPER_ADMIN") return;
  try {
    await ensureSeedLocations(auth.profile.organizationId);
  } catch {
    // Listing should still work if seed cannot run (missing service role, race, etc.).
  }
}

async function offlineAfterSeconds(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
): Promise<number> {
  const { data } = await client
    .from("organization_settings")
    .select("offline_after_seconds")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const value = asNumber(
    (data as { offline_after_seconds?: number } | null)?.offline_after_seconds,
    DEFAULT_OFFLINE_AFTER_SECONDS,
  );
  return value > 0 ? value : DEFAULT_OFFLINE_AFTER_SECONDS;
}

type LocRow = {
  id: string;
  name: string;
  short_name: string;
  type: string;
  status: string;
  city: string | null;
  created_at: string;
};

type ScreenDb = {
  id: string;
  organization_id: string;
  location_id: string;
  name: string;
  screen_type: string;
  orientation: string;
  width: number;
  height: number;
  operational_status: string;
  app_version: string | null;
  local_manifest_version: number | null;
  cloud_manifest_version: number | null;
  last_heartbeat_at: string | null;
  last_sync_at: string | null;
  total_storage: number | null;
  available_storage: number | null;
  current_playlist_id: string | null;
  currently_playing_media_id: string | null;
  last_error: string | null;
  archived_at: string | null;
};

const SCREEN_COLUMNS =
  "id, organization_id, location_id, name, screen_type, orientation, width, height, operational_status, app_version, local_manifest_version, cloud_manifest_version, last_heartbeat_at, last_sync_at, total_storage, available_storage, current_playlist_id, currently_playing_media_id, last_error, archived_at";

async function loadScreenRecords(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  screens: ScreenDb[],
): Promise<ScreenRecord[]> {
  if (screens.length === 0) return [];

  const locationIds = [...new Set(screens.map((s) => s.location_id))];
  const screenIds = screens.map((s) => s.id);
  const playlistIds = [
    ...new Set(screens.map((s) => s.current_playlist_id).filter((id): id is string => Boolean(id))),
  ];
  const mediaIds = [
    ...new Set(
      screens.map((s) => s.currently_playing_media_id).filter((id): id is string => Boolean(id)),
    ),
  ];

  const [threshold, locRes, memberRes, syncRes, playlistRes, mediaRes] = await Promise.all([
    offlineAfterSeconds(client, organizationId),
    client.from("locations").select("id, name").in("id", locationIds),
    client
      .from("screen_group_members")
      .select("screen_group_id, screen_id")
      .in("screen_id", screenIds),
    client
      .from("device_sync_states")
      .select(
        "screen_id, sync_state, sync_progress, local_manifest_version, cloud_manifest_version",
      )
      .in("screen_id", screenIds),
    playlistIds.length > 0
      ? client.from("playlists").select("id, name").in("id", playlistIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    mediaIds.length > 0
      ? client.from("media").select("id, name").in("id", mediaIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
  ]);

  throwIfError(locRes.error, "Could not load locations.");
  throwIfError(memberRes.error, "Could not load screen groups.");
  throwIfError(syncRes.error, "Could not load sync state.");

  const locationName = new Map<string, string>();
  for (const row of locRes.data ?? []) {
    locationName.set(
      asString((row as { id: string }).id),
      asString((row as { name: string }).name),
    );
  }

  const groupsByScreen = new Map<string, string[]>();
  for (const row of memberRes.data ?? []) {
    const screenId = asString((row as { screen_id: string }).screen_id);
    const groupId = asString((row as { screen_group_id: string }).screen_group_id);
    const list = groupsByScreen.get(screenId) ?? [];
    list.push(groupId);
    groupsByScreen.set(screenId, list);
  }

  const syncByScreen = new Map<
    string,
    { syncState: DeviceSyncState; progress: number; local: number | null; cloud: number | null }
  >();
  for (const row of syncRes.data ?? []) {
    const raw = row as {
      screen_id: string;
      sync_state: string;
      sync_progress: number | string;
      local_manifest_version: number | null;
      cloud_manifest_version: number | null;
    };
    const state = isSyncState(raw.sync_state) ? raw.sync_state : "WAITING";
    syncByScreen.set(raw.screen_id, {
      syncState: state,
      progress: asNumber(raw.sync_progress, 0),
      local: asNullableNumber(raw.local_manifest_version),
      cloud: asNullableNumber(raw.cloud_manifest_version),
    });
  }

  const playlistName = new Map<string, string>();
  for (const row of playlistRes.data ?? []) {
    playlistName.set(
      asString((row as { id: string }).id),
      asString((row as { name: string }).name),
    );
  }
  const mediaName = new Map<string, string>();
  for (const row of mediaRes.data ?? []) {
    mediaName.set(asString((row as { id: string }).id), asString((row as { name: string }).name));
  }

  const out: ScreenRecord[] = [];
  for (const row of screens) {
    const operational = isOperationalStatus(row.operational_status)
      ? row.operational_status
      : "READY";
    const orientation = isOrientation(row.orientation) ? row.orientation : "LANDSCAPE";
    const sync = syncByScreen.get(row.id);
    const syncState = sync?.syncState ?? "WAITING";
    out.push({
      id: row.id,
      name: row.name,
      locationId: row.location_id,
      locationName: locationName.get(row.location_id) ?? "Unknown",
      groupIds: groupsByScreen.get(row.id) ?? [],
      connectivity: connectivityOf(row.operational_status, row.last_heartbeat_at, threshold),
      operationalStatus: operational,
      screenType: row.screen_type,
      orientation,
      width: row.width,
      height: row.height,
      playlistId: row.current_playlist_id,
      playlistName: row.current_playlist_id
        ? (playlistName.get(row.current_playlist_id) ?? null)
        : null,
      nowPlaying: row.currently_playing_media_id
        ? (mediaName.get(row.currently_playing_media_id) ?? null)
        : null,
      nowPlayingMediaId: row.currently_playing_media_id,
      syncState,
      syncProgress: sync?.progress ?? 0,
      lastHeartbeatAt: row.last_heartbeat_at,
      lastSyncAt: row.last_sync_at,
      localManifestVersion: sync?.local ?? asNullableNumber(row.local_manifest_version),
      cloudManifestVersion: sync?.cloud ?? asNullableNumber(row.cloud_manifest_version),
      totalStorageBytes: asNullableNumber(row.total_storage),
      availableStorageBytes: asNullableNumber(row.available_storage),
      appVersion: row.app_version,
      lastError: asNullableString(row.last_error),
    });
  }
  return out;
}

async function loadLocationRecords(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  rows: LocRow[],
): Promise<LocationRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: screens, error } = await client
    .from("screens")
    .select("location_id, operational_status, last_heartbeat_at, archived_at")
    .in("location_id", ids)
    .is("archived_at", null);
  throwIfError(error, "Could not load screens.");
  const threshold = await offlineAfterSeconds(client, organizationId);

  const counts = new Map<string, { total: number; online: number }>();
  for (const loc of rows) counts.set(loc.id, { total: 0, online: 0 });
  for (const screen of screens ?? []) {
    const locationId = asString((screen as { location_id: string }).location_id);
    const bucket = counts.get(locationId);
    if (!bucket) continue;
    bucket.total += 1;
    const conn = connectivityOf(
      asString((screen as { operational_status: string }).operational_status),
      asNullableString((screen as { last_heartbeat_at: string | null }).last_heartbeat_at),
      threshold,
    );
    if (conn === "ONLINE") bucket.online += 1;
  }

  return rows.map((row) => {
    const type = isLocationType(row.type) ? row.type : "OTHER";
    const status = isLocationStatus(row.status) ? row.status : "ACTIVE";
    const bucket = counts.get(row.id) ?? { total: 0, online: 0 };
    return {
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      type,
      status,
      city: row.city ?? "",
      screenCount: bucket.total,
      onlineCount: bucket.online,
      activeCampaigns: 0,
      createdAt: row.created_at,
    };
  });
}

export async function listLocations(accessToken: string): Promise<LocationRecord[]> {
  const auth = await requireCmsPermission(accessToken, "locations.view");
  await maybeSeed(auth);
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("locations")
    .select("id, name, short_name, type, status, city, created_at")
    .eq("organization_id", auth.profile.organizationId)
    .order("created_at", { ascending: true });
  throwIfError(error, "Could not load locations.");
  const records = await loadLocationRecords(
    client,
    auth.profile.organizationId,
    (data ?? []) as LocRow[],
  );
  return filterLocationsByScope(auth.profile, records);
}

export async function getLocation(accessToken: string, id: string): Promise<LocationRecord | null> {
  const auth = await requireCmsPermission(accessToken, "locations.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("locations")
    .select("id, name, short_name, type, status, city, created_at")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error, "Could not load location.");
  if (!data) return null;
  const rows = await loadLocationRecords(client, auth.profile.organizationId, [data as LocRow]);
  return filterLocationsByScope(auth.profile, rows)[0] ?? null;
}

export async function createLocation(
  accessToken: string,
  input: {
    name: string;
    shortName: string;
    city: string;
    type: LocationType;
    status: LocationStatus;
  },
): Promise<LocationRecord> {
  const auth = await requireCmsPermission(accessToken, "locations.view");
  if (auth.profile.role !== "SUPER_ADMIN") {
    throw new Error("Only a Super Admin can add locations.");
  }
  await maybeSeed(auth);
  const client = getUserClient(accessToken);
  const shortName = input.shortName.trim() || input.name.trim();
  const code = locationCodeFromName(input.name);
  let created: LocRow | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? code : `${code.slice(0, 36)}-${attempt + 1}`.slice(0, 40);
    const { data, error } = await client
      .from("locations")
      .insert({
        organization_id: auth.profile.organizationId,
        name: input.name.trim(),
        short_name: shortName.slice(0, 80),
        code: candidate,
        type: input.type,
        status: input.status,
        city: input.city.trim() || "Doha",
        timezone: "Asia/Qatar",
        created_by: auth.userId,
      })
      .select("id, name, short_name, type, status, city, created_at")
      .single();
    if (!error && data) {
      created = data as LocRow;
      break;
    }
    if (error?.code === "23505") continue;
    throw new Error(error?.message ?? "Could not create the location.");
  }
  if (!created) throw new Error("Could not generate a unique location code.");
  const rows = await loadLocationRecords(client, auth.profile.organizationId, [created]);
  const row = rows[0];
  if (!row) throw new Error("Location was created but could not be loaded.");
  return row;
}

export async function updateLocation(
  accessToken: string,
  id: string,
  input: {
    name: string;
    shortName: string;
    city: string;
    type: LocationType;
    status: LocationStatus;
  },
): Promise<LocationRecord> {
  const auth = await requireCmsPermission(accessToken, "locations.view");
  if (auth.profile.role !== "SUPER_ADMIN") {
    throw new Error("Only a Super Admin can edit locations.");
  }
  const existing = await getLocation(accessToken, id);
  if (!existing) throw new Error("Location not found.");
  const client = getUserClient(accessToken);
  const shortName = input.shortName.trim() || input.name.trim();
  const { data, error } = await client
    .from("locations")
    .update({
      name: input.name.trim(),
      short_name: shortName.slice(0, 80),
      city: input.city.trim() || "Doha",
      type: input.type,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId)
    .select("id, name, short_name, type, status, city, created_at")
    .single();
  throwIfError(error, "Could not update the location.");
  const rows = await loadLocationRecords(client, auth.profile.organizationId, [data as LocRow]);
  const row = rows[0];
  if (!row) throw new Error("Location was updated but could not be loaded.");
  return row;
}

export async function deleteLocation(accessToken: string, id: string): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "locations.view");
  if (auth.profile.role !== "SUPER_ADMIN") {
    throw new Error("Only a Super Admin can delete locations.");
  }
  const existing = await getLocation(accessToken, id);
  if (!existing) throw new Error("Location not found.");
  const client = getUserClient(accessToken);
  const { count, error: countError } = await client
    .from("screens")
    .select("id", { count: "exact", head: true })
    .eq("location_id", id)
    .is("archived_at", null);
  throwIfError(countError, "Could not check screens at this location.");
  if ((count ?? 0) > 0) {
    throw new Error("Unpair all screens at this location before deleting it.");
  }
  const { error: archivedError } = await client
    .from("screens")
    .delete()
    .eq("location_id", id)
    .not("archived_at", "is", null);
  throwIfError(archivedError, "Could not remove unpaired screens at this location.");
  const { error } = await client
    .from("locations")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId);
  throwIfError(error, "Could not delete the location.");
  return true;
}

async function listScreenRows(accessToken: string, locationId?: string): Promise<ScreenRecord[]> {
  const auth = await requireCmsPermission(accessToken, "screens.view");
  await maybeSeed(auth);
  if (locationId) assertLocationAccess(auth.profile, locationId);
  const client = getUserClient(accessToken);
  let query = client
    .from("screens")
    .select(SCREEN_COLUMNS)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query;
  throwIfError(error, "Could not load screens.");
  const records = await loadScreenRecords(
    client,
    auth.profile.organizationId,
    (data ?? []) as ScreenDb[],
  );
  return filterScreensByScope(auth.profile, records);
}

export async function listScreens(accessToken: string): Promise<ScreenRecord[]> {
  return listScreenRows(accessToken);
}

export async function listScreensByLocation(
  accessToken: string,
  locationId: string,
): Promise<ScreenRecord[]> {
  return listScreenRows(accessToken, locationId);
}

export async function getScreen(accessToken: string, id: string): Promise<ScreenRecord | null> {
  const auth = await requireCmsPermission(accessToken, "screens.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("screens")
    .select(SCREEN_COLUMNS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  throwIfError(error, "Could not load screen.");
  if (!data) return null;
  const rows = await loadScreenRecords(client, auth.profile.organizationId, [data as ScreenDb]);
  return filterScreensByScope(auth.profile, rows)[0] ?? null;
}

export async function pairScreen(
  accessToken: string,
  input: {
    code: string;
    name: string;
    locationId: string;
    screenType: string;
    orientation: Orientation;
    resolution: string;
    groupIds: string[];
  },
): Promise<ScreenRecord> {
  const auth = await requireCmsPermission(accessToken, "screens.manage");
  const digits = assertPairingCodeDigits(input.code);

  const client = getUserClient(accessToken);
  const { data: location, error: locError } = await client
    .from("locations")
    .select("id, organization_id, type")
    .eq("id", input.locationId)
    .maybeSingle();
  throwIfError(locError, "Could not load location.");
  if (!location) throw new Error("Location not found.");
  const loc = location as { id: string; organization_id: string; type: string };
  if (loc.organization_id !== auth.profile.organizationId) {
    throw new Error("Location not found.");
  }
  assertAssignedLocation(auth.profile, loc.id, loc.type);

  const { width, height } = parseResolution(input.resolution, input.orientation);
  const admin = getServiceRoleClient();
  const { data: inserted, error: insertError } = await admin
    .from("screens")
    .insert({
      organization_id: auth.profile.organizationId,
      location_id: input.locationId,
      name: input.name.trim(),
      device_id: null,
      screen_type: input.screenType,
      orientation: input.orientation,
      width,
      height,
      operational_status: "READY",
      last_heartbeat_at: null,
      created_by: auth.userId,
    })
    .select(SCREEN_COLUMNS)
    .single();
  throwIfError(insertError, "Could not create the screen.");
  if (!inserted) throw new Error("Could not create the screen.");
  const screen = inserted as ScreenDb;

  const { error: syncError } = await admin.from("device_sync_states").insert({
    screen_id: screen.id,
    sync_state: "WAITING",
    sync_progress: 0,
    package_state: "PENDING",
  });
  throwIfError(syncError, "Could not initialize sync state.");

  const groupIds = [...new Set(input.groupIds)];
  if (groupIds.length > 0) {
    const { data: groups, error: groupError } = await admin
      .from("screen_groups")
      .select("id")
      .eq("organization_id", auth.profile.organizationId)
      .in("id", groupIds);
    throwIfError(groupError, "Could not load screen groups.");
    const valid = new Set((groups ?? []).map((g) => asString((g as { id: string }).id)));
    const members = groupIds
      .filter((id) => valid.has(id))
      .map((screen_group_id) => ({ screen_group_id, screen_id: screen.id }));
    if (members.length > 0) {
      const { error: memberError } = await admin.from("screen_group_members").insert(members);
      throwIfError(memberError, "Could not add the screen to groups.");
    }
  }

  const existing = await lookupPairingCode(admin, digits);
  await attachPairingCodeToScreen(
    admin,
    auth.profile.organizationId,
    screen.id,
    digits,
    existing,
  );

  const records = await loadScreenRecords(client, auth.profile.organizationId, [screen]);
  const record = records[0];
  if (!record) throw new Error("Screen was created but could not be loaded.");
  return record;
}

export async function updateScreen(
  accessToken: string,
  id: string,
  patch: {
    name?: string | undefined;
    screenType?: string | undefined;
    orientation?: Orientation | undefined;
    width?: number | undefined;
    height?: number | undefined;
    operationalStatus?: ScreenOperationalStatus | undefined;
    groupIds?: string[] | undefined;
    playlistId?: string | null | undefined;
  },
): Promise<ScreenRecord> {
  const auth = await requireCmsPermission(accessToken, "screens.manage");
  const current = await getScreen(accessToken, id);
  if (!current) throw new Error("Screen not found.");

  const client = getUserClient(accessToken);
  const { data: location, error: locError } = await client
    .from("locations")
    .select("id, type")
    .eq("id", current.locationId)
    .maybeSingle();
  throwIfError(locError, "Could not load location.");
  if (!location) throw new Error("Location not found.");
  assertAssignedLocation(
    auth.profile,
    current.locationId,
    asString((location as { type: string }).type),
  );

  const updates: Record<string, unknown> = {};
  if (patch.name != null) updates["name"] = patch.name;
  if (patch.screenType != null) updates["screen_type"] = patch.screenType;
  if (patch.orientation != null) updates["orientation"] = patch.orientation;
  if (patch.width != null) updates["width"] = patch.width;
  if (patch.height != null) updates["height"] = patch.height;
  if (patch.operationalStatus != null) updates["operational_status"] = patch.operationalStatus;
  if (patch.playlistId !== undefined) {
    if (patch.playlistId == null) {
      updates["current_playlist_id"] = null;
    } else {
      const { data: playlist, error: plError } = await client
        .from("playlists")
        .select("id")
        .eq("id", patch.playlistId)
        .maybeSingle();
      throwIfError(plError, "Could not load playlist.");
      if (!playlist) {
        throw new Error("Playlists are not connected yet. Live playlists land in a later phase.");
      }
      updates["current_playlist_id"] = patch.playlistId;
    }
  }

  const admin = getServiceRoleClient();
  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("screens").update(updates).eq("id", id);
    throwIfError(error, "Could not update the screen.");
  }

  if (patch.groupIds) {
    const { error: delError } = await admin
      .from("screen_group_members")
      .delete()
      .eq("screen_id", id);
    throwIfError(delError, "Could not update group membership.");
    const unique = [...new Set(patch.groupIds)];
    if (unique.length > 0) {
      const { error: insError } = await admin
        .from("screen_group_members")
        .insert(unique.map((screen_group_id) => ({ screen_group_id, screen_id: id })));
      throwIfError(insError, "Could not update group membership.");
    }
  }

  const next = await getScreen(accessToken, id);
  if (!next) throw new Error("Screen not found.");
  return next;
}

export async function requestScreenSync(accessToken: string, id: string): Promise<ScreenRecord> {
  const auth = await requireCmsPermission(accessToken, "screens.manage");
  const current = await getScreen(accessToken, id);
  if (!current) throw new Error("Screen not found.");
  const client = getUserClient(accessToken);
  const { data: location, error: locError } = await client
    .from("locations")
    .select("type")
    .eq("id", current.locationId)
    .maybeSingle();
  throwIfError(locError, "Could not load location.");
  assertAssignedLocation(
    auth.profile,
    current.locationId,
    asString((location as { type?: string } | null)?.type),
  );

  const admin = getServiceRoleClient();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("device_sync_states")
    .select("screen_id")
    .eq("screen_id", id)
    .maybeSingle();
  throwIfError(existingError, "Could not load sync state.");
  if (existing) {
    const { error } = await admin
      .from("device_sync_states")
      .update({ sync_requested_at: now })
      .eq("screen_id", id);
    throwIfError(error, "Could not request sync.");
  } else {
    const { error } = await admin.from("device_sync_states").insert({
      screen_id: id,
      sync_requested_at: now,
      sync_state: "WAITING",
      sync_progress: 0,
      package_state: "PENDING",
    });
    throwIfError(error, "Could not request sync.");
  }
  const next = await getScreen(accessToken, id);
  if (!next) throw new Error("Screen not found.");
  return next;
}

export async function repairScreen(
  accessToken: string,
  id: string,
  code: string,
): Promise<ScreenRecord> {
  const auth = await requireCmsPermission(accessToken, "screens.manage");
  const current = await getScreen(accessToken, id);
  if (!current) throw new Error("Screen not found.");
  await requireScreenLocation(accessToken, auth, current);

  const digits = assertPairingCodeDigits(code);
  const admin = getServiceRoleClient();
  const existing = await lookupPairingCode(admin, digits);
  if (!existing) {
    throw new Error(
      "No player is showing this code. Start pairing on the TV first, then enter the 6-digit code.",
    );
  }
  const linkErrorMessage = pairingCodeLinkError(
    {
      expiresAt: existing.expires_at,
      consumedAt: existing.consumed_at,
      screenId: existing.screen_id,
    },
    id,
  );
  if (linkErrorMessage) throw new Error(linkErrorMessage);

  const now = new Date().toISOString();
  const { error: tokenError } = await admin
    .from("device_tokens")
    .update({ revoked_at: now })
    .eq("screen_id", id)
    .is("revoked_at", null);
  throwIfError(tokenError, "Could not revoke device tokens.");

  const { error: pairError } = await admin
    .from("device_pairing_codes")
    .update({ consumed_at: now })
    .eq("screen_id", id)
    .is("consumed_at", null)
    .neq("id", existing.id);
  throwIfError(pairError, "Could not invalidate previous pairing codes.");

  await attachPairingCodeToScreen(admin, auth.profile.organizationId, id, digits, existing);

  const { error: heartbeatError } = await admin
    .from("screens")
    .update({ last_heartbeat_at: null })
    .eq("id", id);
  throwIfError(heartbeatError, "Could not reset the screen connection.");

  const { error: syncError } = await admin
    .from("device_sync_states")
    .update({
      sync_state: "WAITING",
      sync_progress: 0,
      package_state: "PENDING",
    })
    .eq("screen_id", id);
  throwIfError(syncError, "Could not reset sync state.");

  const next = await getScreen(accessToken, id);
  if (!next) throw new Error("Screen not found.");
  return next;
}

export async function unpairScreen(accessToken: string, id: string): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "screens.manage");
  const current = await getScreen(accessToken, id);
  if (!current) throw new Error("Screen not found.");
  await requireScreenLocation(accessToken, auth, current);

  const admin = getServiceRoleClient();
  const now = new Date().toISOString();
  const { error: tokenError } = await admin
    .from("device_tokens")
    .update({ revoked_at: now })
    .eq("screen_id", id)
    .is("revoked_at", null);
  throwIfError(tokenError, "Could not revoke device tokens.");

  const { error: pairError } = await admin
    .from("device_pairing_codes")
    .update({ consumed_at: now })
    .eq("screen_id", id)
    .is("consumed_at", null);
  throwIfError(pairError, "Could not invalidate pairing codes.");

  const { error: screenError } = await admin
    .from("screens")
    .update({
      device_id: null,
      device_name: null,
      archived_at: now,
    })
    .eq("id", id);
  throwIfError(screenError, "Could not unpair the screen.");
  return true;
}

export async function listScreenGroups(accessToken: string): Promise<ScreenGroupRecord[]> {
  const auth = await requireCmsPermission(accessToken, "screens.view");
  const client = getUserClient(accessToken);
  const { data: groups, error } = await client
    .from("screen_groups")
    .select("id, name, description")
    .eq("organization_id", auth.profile.organizationId)
    .order("name", { ascending: true });
  throwIfError(error, "Could not load screen groups.");
  const ids = (groups ?? []).map((g) => asString((g as { id: string }).id));
  const members =
    ids.length > 0
      ? await client
          .from("screen_group_members")
          .select("screen_group_id, screen_id")
          .in("screen_group_id", ids)
      : { data: [] as Array<{ screen_group_id: string; screen_id: string }>, error: null };
  throwIfError(members.error, "Could not load group members.");

  const byGroup = new Map<string, string[]>();
  for (const row of members.data ?? []) {
    const groupId = asString((row as { screen_group_id: string }).screen_group_id);
    const screenId = asString((row as { screen_id: string }).screen_id);
    const list = byGroup.get(groupId) ?? [];
    list.push(screenId);
    byGroup.set(groupId, list);
  }

  return (groups ?? []).map((g) => {
    const row = g as { id: string; name: string; description: string | null };
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      screenIds: byGroup.get(row.id) ?? [],
    };
  });
}

export async function createScreenGroup(
  accessToken: string,
  input: { name: string; description: string; screenIds: string[] },
): Promise<ScreenGroupRecord> {
  const auth = await requireCmsPermission(accessToken, "screens.manage");
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from("screen_groups")
    .insert({
      organization_id: auth.profile.organizationId,
      name: input.name.trim(),
      description: input.description.trim() || null,
      created_by: auth.userId,
    })
    .select("id, name, description")
    .single();
  throwIfError(error, "Could not create the group.");
  if (!data) throw new Error("Could not create the group.");
  const group = data as { id: string; name: string; description: string | null };
  if (input.screenIds.length > 0) {
    const { error: memberError } = await admin
      .from("screen_group_members")
      .insert(input.screenIds.map((screen_id) => ({ screen_group_id: group.id, screen_id })));
    throwIfError(memberError, "Could not add screens to the group.");
  }
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? "",
    screenIds: input.screenIds,
  };
}

export async function updateScreenGroup(
  accessToken: string,
  id: string,
  patch: {
    name?: string | undefined;
    description?: string | undefined;
    screenIds?: string[] | undefined;
  },
): Promise<ScreenGroupRecord> {
  await requireCmsPermission(accessToken, "screens.manage");
  const admin = getServiceRoleClient();
  const updates: Record<string, unknown> = {};
  if (patch.name != null) updates["name"] = patch.name.trim();
  if (patch.description != null) updates["description"] = patch.description.trim() || null;
  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("screen_groups").update(updates).eq("id", id);
    throwIfError(error, "Could not update the group.");
  }
  if (patch.screenIds) {
    const { error: delError } = await admin
      .from("screen_group_members")
      .delete()
      .eq("screen_group_id", id);
    throwIfError(delError, "Could not update group members.");
    if (patch.screenIds.length > 0) {
      const { error: insError } = await admin
        .from("screen_group_members")
        .insert(patch.screenIds.map((screen_id) => ({ screen_group_id: id, screen_id })));
      throwIfError(insError, "Could not update group members.");
    }
  }
  const groups = await listScreenGroups(accessToken);
  const group = groups.find((g) => g.id === id);
  if (!group) throw new Error("Group not found.");
  return group;
}

export async function removeScreenGroup(accessToken: string, id: string): Promise<boolean> {
  await requireCmsPermission(accessToken, "screens.manage");
  const admin = getServiceRoleClient();
  const { error } = await admin.from("screen_groups").delete().eq("id", id);
  throwIfError(error, "Could not delete the group.");
  return true;
}
