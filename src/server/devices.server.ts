import { randomUUID } from "node:crypto";

import {
  deviceActivateRequestSchema,
  deviceHeartbeatRequestSchema,
  devicePairRequestSchema,
  deviceSyncConfirmationSchema,
  errorLogBatchSchema,
  playbackLogBatchSchema,
  type ContentManifest,
  type DeviceActivateResponse,
  type DevicePairResponse,
  type DeviceSyncStatusResponse,
} from "@e3/api-contracts";
import {
  CONTENT_PACKAGE_STATES,
  DEVICE_SYNC_STATES,
  FIT_MODES,
  MEDIA_TYPES,
  TRANSITIONS,
  ZONE_CONTENT_TYPES,
  type ContentPackageState,
  type DeviceSyncState,
  type FitMode,
  type MediaType,
  type Transition,
  type ZoneContentType,
} from "@e3/shared-types";

import {
  generateDeviceToken,
  generatePairingCode,
  hashDeviceToken,
  hashPairingCode,
} from "@/lib/device-crypto";
import { uiTime } from "@/lib/schedule-days";
import { wallTimeToIso } from "@/lib/zoned-time";
import { isUuid } from "@/services/inventory-map";
import type { JsonResult } from "./http/contracts";
import { DOWNLOAD_URL_TTL_SECONDS, createObjectDownloadUrls } from "./storage.server";
import { canTransitionPackage, canTransitionSync } from "./sync-state";
import { getServiceRoleClient } from "./supabase.server";

const DEFAULT_PAIR_TTL_SECONDS = 300;
const POLL_AFTER_MS = 2000;
const MANIFEST_URL_TTL_SECONDS = Math.max(DOWNLOAD_URL_TTL_SECONDS, 6 * 60 * 60);

type AdminClient = ReturnType<typeof getServiceRoleClient>;

type DeviceScreen = {
  id: string;
  organization_id: string;
  device_id: string | null;
  archived_at: string | null;
  operational_status: string;
  cloud_manifest_version: number | null;
  cloud_config_version: number | null;
  local_manifest_version: number | null;
};

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asDayNums(value: unknown): number[] {
  if (!Array.isArray(value)) return [0, 1, 2, 3, 4, 5, 6];
  return value.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function isPackageState(value: string): value is ContentPackageState {
  return (CONTENT_PACKAGE_STATES as readonly string[]).includes(value);
}

function isSyncState(value: string): value is DeviceSyncState {
  return (DEVICE_SYNC_STATES as readonly string[]).includes(value);
}

function isMediaType(value: string): value is MediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value);
}

function isZoneType(value: string): value is ZoneContentType {
  return (ZONE_CONTENT_TYPES as readonly string[]).includes(value);
}

function isFit(value: string): value is FitMode {
  return (FIT_MODES as readonly string[]).includes(value);
}

function isTransition(value: string): value is Transition {
  return (TRANSITIONS as readonly string[]).includes(value);
}

function fail<T>(status: number, message: string): JsonResult<T> {
  return { status, body: { error: message } as T };
}

function ok<T>(body: T, status = 200): JsonResult<T> {
  return { status, body };
}

function isoNow(): string {
  return new Date().toISOString();
}

async function pairingTtlSeconds(admin: AdminClient): Promise<number> {
  const { data } = await admin
    .from("organization_settings")
    .select("pairing_code_ttl_seconds")
    .limit(1)
    .maybeSingle();
  const ttl = asNumber((data as { pairing_code_ttl_seconds?: number } | null)?.pairing_code_ttl_seconds, DEFAULT_PAIR_TTL_SECONDS);
  return ttl > 0 ? ttl : DEFAULT_PAIR_TTL_SECONDS;
}

async function touchToken(admin: AdminClient, tokenId: string): Promise<void> {
  await admin.from("device_tokens").update({ last_used_at: isoNow() }).eq("id", tokenId);
}

type DeviceAuthOk = {
  ok: true;
  screen: DeviceScreen;
  tokenId: string;
  admin: AdminClient;
};

export async function requireDevice(
  token: string | null,
  deviceIdParam: string,
): Promise<DeviceAuthOk | JsonResult<{ error: string }>> {
  if (!token) return fail(401, "Missing device token.");
  if (!isUuid(deviceIdParam)) return fail(400, "Invalid device id.");
  const admin = getServiceRoleClient();
  const tokenHash = hashDeviceToken(token);
  const { data: tokenRow, error: tokenError } = await admin
    .from("device_tokens")
    .select("id, screen_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  throwIfError(tokenError, "Could not validate device token.");
  if (!tokenRow || asNullableString((tokenRow as { revoked_at: string | null }).revoked_at)) {
    return fail(401, "Invalid device token.");
  }
  const screenId = asString((tokenRow as { screen_id: string }).screen_id);
  const { data: screen, error: screenError } = await admin
    .from("screens")
    .select(
      "id, organization_id, device_id, archived_at, operational_status, cloud_manifest_version, cloud_config_version, local_manifest_version",
    )
    .eq("id", screenId)
    .maybeSingle();
  throwIfError(screenError, "Could not load screen.");
  if (!screen) return fail(401, "Invalid device token.");
  const row = screen as DeviceScreen;
  if (row.archived_at) return fail(403, "This screen has been unpaired.");
  if (deviceIdParam !== row.id && deviceIdParam !== row.device_id) {
    return fail(403, "Token does not match this device.");
  }
  await touchToken(admin, asString((tokenRow as { id: string }).id));
  return {
    ok: true,
    screen: row,
    tokenId: asString((tokenRow as { id: string }).id),
    admin,
  };
}

export async function pairDevice(input: unknown): Promise<JsonResult<DevicePairResponse | { error: string }>> {
  const parsed = devicePairRequestSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid pair request.");
  const admin = getServiceRoleClient();
  const ttlSeconds = await pairingTtlSeconds(admin);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    code = generatePairingCode();
    const { error } = await admin.from("device_pairing_codes").insert({
      code_hash: hashPairingCode(code),
      expires_at: expiresAt,
      app_version: parsed.data.appVersion,
      device_name: parsed.data.deviceName ?? null,
    });
    if (!error) {
      return ok({
        code,
        expiresAt,
        pollAfterMs: POLL_AFTER_MS,
      });
    }
    if (!error.message.toLowerCase().includes("duplicate") && !error.message.includes("unique")) {
      throwIfError(error, "Could not create pairing code.");
    }
  }
  return fail(503, "Could not allocate a pairing code. Retry shortly.");
}

export async function activateDevice(
  input: unknown,
): Promise<JsonResult<DeviceActivateResponse | { error: string }>> {
  const parsed = deviceActivateRequestSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid activate request.");
  const admin = getServiceRoleClient();
  const codeHash = hashPairingCode(parsed.data.code);
  const { data, error } = await admin
    .from("device_pairing_codes")
    .select("id, expires_at, consumed_at, screen_id, app_version, device_name")
    .eq("code_hash", codeHash)
    .maybeSingle();
  throwIfError(error, "Could not look up pairing code.");
  if (!data) return ok({ status: "INVALID" });
  const row = data as {
    id: string;
    expires_at: string;
    consumed_at: string | null;
    screen_id: string | null;
    app_version: string | null;
    device_name: string | null;
  };
  if (row.consumed_at) return ok({ status: "INVALID" });
  if (new Date(row.expires_at).getTime() < Date.now()) return ok({ status: "EXPIRED" });
  if (!row.screen_id) return ok({ status: "PENDING" });

  const { data: screen, error: screenError } = await admin
    .from("screens")
    .select("id, device_id, archived_at")
    .eq("id", row.screen_id)
    .maybeSingle();
  throwIfError(screenError, "Could not load screen.");
  if (!screen || asNullableString((screen as { archived_at: string | null }).archived_at)) {
    return ok({ status: "INVALID" });
  }
  const screenId = asString((screen as { id: string }).id);
  let deviceId = asNullableString((screen as { device_id: string | null }).device_id);
  if (!deviceId) deviceId = randomUUID();

  const now = isoNow();
  const rawToken = generateDeviceToken();
  await admin
    .from("device_tokens")
    .update({ revoked_at: now })
    .eq("screen_id", screenId)
    .is("revoked_at", null);

  const { error: tokenError } = await admin.from("device_tokens").insert({
    screen_id: screenId,
    token_hash: hashDeviceToken(rawToken),
    last_used_at: now,
  });
  throwIfError(tokenError, "Could not issue a device token.");

  const { error: consumeError } = await admin
    .from("device_pairing_codes")
    .update({ consumed_at: now, screen_id: screenId })
    .eq("id", row.id);
  throwIfError(consumeError, "Could not consume pairing code.");

  const { error: screenUpdateError } = await admin
    .from("screens")
    .update({
      device_id: deviceId,
      device_name: row.device_name,
      app_version: row.app_version,
    })
    .eq("id", screenId);
  throwIfError(screenUpdateError, "Could not attach the device.");

  const { error: syncError } = await admin.from("device_sync_states").upsert(
    {
      screen_id: screenId,
      sync_state: "WAITING",
      sync_progress: 0,
      package_state: "PENDING",
      updated_at: now,
    },
    { onConflict: "screen_id" },
  );
  throwIfError(syncError, "Could not initialize sync state.");

  return ok({
    status: "ACTIVATED",
    deviceToken: rawToken,
    deviceId,
    screenId,
  });
}

export async function deviceSyncStatus(
  deviceId: string,
  token: string | null,
): Promise<JsonResult<DeviceSyncStatusResponse | { error: string }>> {
  const auth = await requireDevice(token, deviceId);
  if (!("ok" in auth)) return auth;
  const { data, error } = await auth.admin
    .from("device_sync_states")
    .select(
      "cloud_manifest_version, cloud_config_version, local_manifest_version, pending_manifest_id, sync_requested_at",
    )
    .eq("screen_id", auth.screen.id)
    .maybeSingle();
  throwIfError(error, "Could not load sync status.");
  const cloud = asNumber(
    (data as { cloud_manifest_version?: number } | null)?.cloud_manifest_version,
    asNumber(auth.screen.cloud_manifest_version, 0),
  );
  const local = asNumber(
    (data as { local_manifest_version?: number } | null)?.local_manifest_version,
    asNumber(auth.screen.local_manifest_version, 0),
  );
  const configVersion = asNumber(
    (data as { cloud_config_version?: number } | null)?.cloud_config_version,
    asNumber(auth.screen.cloud_config_version, 1),
  );
  const pending = asNullableString((data as { pending_manifest_id?: string | null } | null)?.pending_manifest_id);
  const requestedAt = asNullableString((data as { sync_requested_at?: string | null } | null)?.sync_requested_at);
  return ok({
    manifestVersion: cloud,
    configVersion: configVersion > 0 ? configVersion : 1,
    syncRequested: Boolean(requestedAt) || cloud > local || Boolean(pending),
  });
}

async function orgLoopsPlaylists(admin: AdminClient, organizationId: string): Promise<boolean> {
  const { data } = await admin
    .from("organization_settings")
    .select("loop_playlists")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const value = (data as { loop_playlists?: boolean } | null)?.loop_playlists;
  return value !== false;
}

async function buildManifest(
  admin: AdminClient,
  screen: DeviceScreen,
): Promise<ContentManifest | null> {
  const { data: sync } = await admin
    .from("device_sync_states")
    .select("pending_manifest_id, active_manifest_id, cloud_manifest_version, cloud_config_version")
    .eq("screen_id", screen.id)
    .maybeSingle();
  const pendingId = asNullableString((sync as { pending_manifest_id?: string | null } | null)?.pending_manifest_id);
  const activeId = asNullableString((sync as { active_manifest_id?: string | null } | null)?.active_manifest_id);
  let manifestRow: Record<string, unknown> | null = null;
  if (pendingId) {
    const { data } = await admin.from("content_manifests").select("*").eq("id", pendingId).maybeSingle();
    manifestRow = (data as Record<string, unknown> | null) ?? null;
  }
  if (!manifestRow && activeId) {
    const { data } = await admin.from("content_manifests").select("*").eq("id", activeId).maybeSingle();
    manifestRow = (data as Record<string, unknown> | null) ?? null;
  }
  if (!manifestRow) {
    const { data } = await admin
      .from("content_manifests")
      .select("*")
      .eq("screen_id", screen.id)
      .order("manifest_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    manifestRow = (data as Record<string, unknown> | null) ?? null;
  }
  if (!manifestRow) return null;

  const manifestId = asString(manifestRow["id"]);
  const campaignId = asNullableString(manifestRow["campaign_id"]);
  const manifestVersion = asNumber(manifestRow["manifest_version"], 1);
  const configVersion = asNumber(
    (sync as { cloud_config_version?: number } | null)?.cloud_config_version,
    asNumber(manifestRow["config_version"], 1),
  );
  const generatedAt = asString(manifestRow["generated_at"], isoNow());

  const { data: assetRows, error: assetError } = await admin
    .from("manifest_assets")
    .select("media_id, media_version_id, checksum_sha256, file_size, local_filename, asset_type")
    .eq("manifest_id", manifestId);
  throwIfError(assetError, "Could not load manifest assets.");

  const versionIds = [
    ...new Set((assetRows ?? []).map((row) => asString((row as { media_version_id: string }).media_version_id))),
  ].filter(Boolean);
  const { data: versions, error: versionError } = versionIds.length
    ? await admin
        .from("media_versions")
        .select("id, media_id, version_number, storage_key, mime_type, checksum_sha256, size_bytes")
        .in("id", versionIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  throwIfError(versionError, "Could not load media versions.");
  const versionById = new Map(
    (versions ?? []).map((row) => [asString((row as { id: string }).id), row as Record<string, unknown>]),
  );
  const keys = [...new Set((versions ?? []).map((row) => asString((row as { storage_key: string }).storage_key)))].filter(
    Boolean,
  );
  const signed = await createObjectDownloadUrls(keys, MANIFEST_URL_TTL_SECONDS);

  const assets: ContentManifest["assets"] = [];
  const localByVersion = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const raw of assetRows ?? []) {
    const row = raw as Record<string, unknown>;
    const versionId = asString(row["media_version_id"]);
    const version = versionById.get(versionId);
    if (!version) continue;
    const key = asString(version["storage_key"]);
    const downloadUrl = signed.get(key);
    if (!downloadUrl) continue;
    let localFilename = asString(row["local_filename"], asString(row["media_id"]));
    if (usedNames.has(localFilename)) localFilename = `${asString(row["media_id"]).slice(0, 8)}_${localFilename}`;
    usedNames.add(localFilename);
    localByVersion.set(versionId, localFilename);
    const checksum = asString(row["checksum_sha256"], asString(version["checksum_sha256"])).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum)) continue;
    const type = asString(row["asset_type"], asString(version["mime_type"]));
    assets.push({
      id: asString(row["media_id"]),
      version: Math.max(1, asNumber(version["version_number"], 1)),
      type: isMediaType(type) ? type : "IMAGE",
      checksum,
      fileSize: asNumber(row["file_size"], asNumber(version["size_bytes"])),
      localFilename,
      mimeType: asString(version["mime_type"], "application/octet-stream"),
      downloadUrl,
    });
  }

  let playlistId: string | null = null;
  let layoutId: string | null = null;
  let emergency = false;
  if (campaignId) {
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, playlist_id, layout_id, emergency")
      .eq("id", campaignId)
      .maybeSingle();
    playlistId = asNullableString((campaign as { playlist_id?: string | null } | null)?.playlist_id);
    layoutId = asNullableString((campaign as { layout_id?: string | null } | null)?.layout_id);
    emergency = Boolean((campaign as { emergency?: boolean } | null)?.emergency);
  }

  let playlist: ContentManifest["playlist"] = null;
  const layoutIds = new Set<string>();
  if (layoutId) layoutIds.add(layoutId);
  if (playlistId) {
    const { data: items, error: itemError } = await admin
      .from("playlist_items")
      .select("media_id, media_version_id, duration_seconds, transition, layout_id, position")
      .eq("playlist_id", playlistId)
      .order("position");
    throwIfError(itemError, "Could not load playlist items.");
    const loop = await orgLoopsPlaylists(admin, screen.organization_id);
    playlist = {
      id: playlistId,
      version: 1,
      loop,
      items: (items ?? []).flatMap((raw) => {
        const row = raw as Record<string, unknown>;
        const mediaVersionId = asString(row["media_version_id"]);
        const extraLayout = asNullableString(row["layout_id"]);
        if (extraLayout) layoutIds.add(extraLayout);
        const localFilename = localByVersion.get(mediaVersionId);
        if (!localFilename) return [];
        const transition = asString(row["transition"], "FADE");
        return [
          {
            mediaId: asString(row["media_id"]),
            mediaVersionId,
            durationSeconds: Math.max(0.1, asNumber(row["duration_seconds"], 10)),
            transition: isTransition(transition) ? transition : "FADE",
            localFilename,
          },
        ];
      }),
    };
  }

  const layouts: ContentManifest["layouts"] = [];
  if (layoutIds.size > 0) {
    const ids = [...layoutIds];
    const [{ data: layoutRows, error: layoutError }, { data: zoneRows, error: zoneError }] = await Promise.all([
      admin
        .from("layouts")
        .select("id, width_px, height_px, background, device_json")
        .in("id", ids),
      admin
        .from("layout_zones")
        .select(
          "id, layout_id, type, x_percent, y_percent, width_percent, height_percent, content_ref, fit, sort_order",
        )
        .in("layout_id", ids)
        .order("sort_order"),
    ]);
    throwIfError(layoutError, "Could not load layouts.");
    throwIfError(zoneError, "Could not load layout zones.");
    const zonesByLayout = new Map<string, ContentManifest["layouts"][number]["zones"]>();
    const mediaByName = new Map<string, string>();
    for (const asset of assets) {
      mediaByName.set(asset.id, asset.localFilename);
      mediaByName.set(asset.localFilename, asset.localFilename);
    }
    const mediaIds = assets.map((asset) => asset.id);
    if (mediaIds.length > 0) {
      const { data: mediaNames } = await admin.from("media").select("id, name").in("id", mediaIds);
      for (const row of mediaNames ?? []) {
        const id = asString((row as { id: string }).id);
        const name = asString((row as { name: string }).name);
        const local = mediaByName.get(id);
        if (local && name) mediaByName.set(name, local);
      }
    }

    for (const raw of zoneRows ?? []) {
      const row = raw as Record<string, unknown>;
      const layoutKey = asString(row["layout_id"]);
      const type = asString(row["type"], "IMAGE");
      const fit = asString(row["fit"], "CONTAIN");
      const ref = asNullableString(row["content_ref"]);
      const contentRef = ref ? (mediaByName.get(ref) ?? (isUuid(ref) ? mediaByName.get(ref) ?? ref : ref)) : null;
      const widthPx = 1920;
      const heightPx = 1080;
      const layoutMeta = (layoutRows ?? []).find((item) => asString((item as { id: string }).id) === layoutKey) as
        | { width_px?: number; height_px?: number }
        | undefined;
      const w = asNumber(layoutMeta?.width_px, widthPx);
      const h = asNumber(layoutMeta?.height_px, heightPx);
      const zone = {
        id: asString(row["id"]),
        type: isZoneType(type) ? type : "IMAGE",
        x: Math.round((asNumber(row["x_percent"]) / 100) * w),
        y: Math.round((asNumber(row["y_percent"]) / 100) * h),
        width: Math.max(1, Math.round((asNumber(row["width_percent"]) / 100) * w)),
        height: Math.max(1, Math.round((asNumber(row["height_percent"]) / 100) * h)),
        fit: isFit(fit) ? fit : "CONTAIN",
        contentRef,
      };
      const list = zonesByLayout.get(layoutKey) ?? [];
      list.push(zone);
      zonesByLayout.set(layoutKey, list);
    }

    for (const raw of layoutRows ?? []) {
      const row = raw as Record<string, unknown>;
      const id = asString(row["id"]);
      const json = row["device_json"];
      if (json && typeof json === "object" && json !== null && "zones" in (json as object)) {
        const device = json as {
          widthPx?: number;
          heightPx?: number;
          background?: string;
          zones?: Array<Record<string, unknown>>;
        };
        layouts.push({
          id,
          width: asNumber(device.widthPx, asNumber(row["width_px"], 1920)),
          height: asNumber(device.heightPx, asNumber(row["height_px"], 1080)),
          background: asString(device.background, asString(row["background"], "#19161A")),
          zones: (device.zones ?? []).map((zone) => {
            const type = asString(zone["type"], "IMAGE");
            const fit = asString(zone["fit"], "CONTAIN");
            const ref = asNullableString(zone["contentRef"]);
            return {
              id: asString(zone["id"]),
              type: isZoneType(type) ? type : "IMAGE",
              x: asNumber(zone["x"]),
              y: asNumber(zone["y"]),
              width: Math.max(1, asNumber(zone["width"], 1)),
              height: Math.max(1, asNumber(zone["height"], 1)),
              fit: isFit(fit) ? fit : "CONTAIN",
              contentRef: ref ? (mediaByName.get(ref) ?? ref) : null,
            };
          }),
        });
      } else {
        layouts.push({
          id,
          width: asNumber(row["width_px"], 1920),
          height: asNumber(row["height_px"], 1080),
          background: asString(row["background"], "#19161A"),
          zones: zonesByLayout.get(id) ?? [],
        });
      }
    }
  }

  const schedules: ContentManifest["schedules"] = [];
  if (campaignId) {
    const { data: scheduleRows, error: scheduleError } = await admin
      .from("schedules")
      .select("start_date, end_date, start_time, end_time, days_of_week, timezone, priority")
      .eq("campaign_id", campaignId);
    throwIfError(scheduleError, "Could not load schedules.");
    for (const raw of scheduleRows ?? []) {
      const row = raw as Record<string, unknown>;
      const tz = asString(row["timezone"], "Asia/Qatar");
      const startDate = asString(row["start_date"]).slice(0, 10);
      const endDate = asString(row["end_date"]).slice(0, 10);
      const startTime = uiTime(asString(row["start_time"], "00:00"));
      const endTime = uiTime(asString(row["end_time"], "23:59"));
      schedules.push({
        campaignId,
        startAt: wallTimeToIso(startDate, startTime, tz),
        endAt: wallTimeToIso(endDate, endTime, tz),
        startTime,
        endTime,
        daysOfWeek: asDayNums(row["days_of_week"]),
        timezone: tz,
        priority: asNumber(row["priority"], 50),
        emergency,
      });
    }
  }

  return {
    screenId: screen.id,
    manifestVersion,
    configVersion: configVersion > 0 ? configVersion : 1,
    generatedAt: generatedAt.includes("T") ? new Date(generatedAt).toISOString() : generatedAt,
    playlist,
    layouts,
    schedules,
    assets,
  };
}

export async function deviceManifest(
  deviceId: string,
  token: string | null,
): Promise<JsonResult<ContentManifest | { error: string }>> {
  const auth = await requireDevice(token, deviceId);
  if (!("ok" in auth)) return auth;
  if (auth.screen.operational_status === "DISABLED") {
    return fail(403, "This screen is disabled.");
  }
  const manifest = await buildManifest(auth.admin, auth.screen);
  if (!manifest) return fail(404, "No content has been published to this screen.");

  const { data: sync } = await auth.admin
    .from("device_sync_states")
    .select("sync_state")
    .eq("screen_id", auth.screen.id)
    .maybeSingle();
  const from = asString((sync as { sync_state?: string } | null)?.sync_state, "WAITING");
  if (from === "WAITING" && canTransitionSync("WAITING", "NOTIFIED")) {
    const now = isoNow();
    await auth.admin
      .from("device_sync_states")
      .update({ sync_state: "NOTIFIED", updated_at: now })
      .eq("screen_id", auth.screen.id);
    await auth.admin.from("sync_events").insert({
      screen_id: auth.screen.id,
      from_state: "WAITING",
      to_state: "NOTIFIED",
      detail: "Device fetched manifest",
    });
  }
  return ok(manifest);
}

function syncStateForPackage(state: ContentPackageState): DeviceSyncState {
  if (state === "PENDING") return "NOTIFIED";
  if (state === "DOWNLOADING") return "DOWNLOADING";
  if (state === "VERIFYING") return "VERIFYING";
  if (state === "READY") return "READY";
  if (state === "ACTIVE") return "ACTIVE";
  return "FAILED";
}

export async function deviceHeartbeat(
  deviceId: string,
  token: string | null,
  input: unknown,
): Promise<JsonResult<{ ok: true } | { error: string }>> {
  const auth = await requireDevice(token, deviceId);
  if (!("ok" in auth)) return auth;
  const parsed = deviceHeartbeatRequestSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid heartbeat.");
  if (parsed.data.screenId !== auth.screen.id) return fail(403, "screenId does not match this device.");
  const now = isoNow();
  const operationalStatus =
    auth.screen.operational_status === "DISABLED" ? "DISABLED" : parsed.data.operationalStatus;
  const lastSuccessfulSyncAt = parsed.data.lastSuccessfulSyncAt ?? null;
  const { error: hbError } = await auth.admin.from("device_heartbeats").insert({
    screen_id: auth.screen.id,
    device_id: auth.screen.device_id,
    app_version: parsed.data.appVersion,
    uptime_seconds: parsed.data.uptimeSeconds,
    active_manifest_version: parsed.data.activeManifestVersion ?? 0,
    active_playlist_id: parsed.data.activePlaylistId ?? null,
    currently_playing_media_id: parsed.data.currentlyPlayingMediaId ?? null,
    total_storage: parsed.data.totalStorageBytes,
    available_storage: parsed.data.availableStorageBytes,
    network_online: parsed.data.networkOnline,
    last_successful_sync_at: lastSuccessfulSyncAt,
    last_error: parsed.data.lastError ?? null,
    operational_status: operationalStatus,
    sync_state: parsed.data.syncState,
    sync_progress: parsed.data.syncProgress,
    received_at: now,
  });
  throwIfError(hbError, "Could not store heartbeat.");

  const screenPatch: Record<string, unknown> = {
    last_heartbeat_at: now,
    app_version: parsed.data.appVersion,
    operational_status: operationalStatus,
    total_storage: parsed.data.totalStorageBytes,
    available_storage: parsed.data.availableStorageBytes,
    current_playlist_id: parsed.data.activePlaylistId ?? null,
    currently_playing_media_id: parsed.data.currentlyPlayingMediaId ?? null,
    last_error: parsed.data.lastError ?? null,
    local_manifest_version: parsed.data.activeManifestVersion ?? 0,
  };
  if (lastSuccessfulSyncAt) screenPatch["last_sync_at"] = lastSuccessfulSyncAt;

  const { error: screenError } = await auth.admin
    .from("screens")
    .update(screenPatch)
    .eq("id", auth.screen.id);
  throwIfError(screenError, "Could not update screen from heartbeat.");

  const { data: sync } = await auth.admin
    .from("device_sync_states")
    .select("sync_state")
    .eq("screen_id", auth.screen.id)
    .maybeSingle();
  const from = asString((sync as { sync_state?: string } | null)?.sync_state, "WAITING");
  const to = parsed.data.syncState;
  const patch: Record<string, unknown> = {
    sync_progress: parsed.data.syncProgress,
    last_error: parsed.data.lastError,
    updated_at: now,
    local_manifest_version: parsed.data.activeManifestVersion,
  };
  if (from !== to && isSyncState(from) && (canTransitionSync(from, to) || to === "OFFLINE" || to === from)) {
    patch["sync_state"] = to;
  } else if (from !== to && isSyncState(to)) {
    patch["sync_state"] = to;
  }
  if (sync) {
    const { error } = await auth.admin.from("device_sync_states").update(patch).eq("screen_id", auth.screen.id);
    throwIfError(error, "Could not update sync state.");
  } else {
    const { error } = await auth.admin.from("device_sync_states").insert({
      screen_id: auth.screen.id,
      ...patch,
      package_state: "PENDING",
    });
    throwIfError(error, "Could not create sync state.");
  }
  if (from !== to && patch["sync_state"]) {
    await auth.admin.from("sync_events").insert({
      screen_id: auth.screen.id,
      from_state: isSyncState(from) ? from : null,
      to_state: to,
      detail: "Heartbeat",
    });
  }
  return ok({ ok: true });
}

export async function deviceSyncConfirmation(
  deviceId: string,
  token: string | null,
  input: unknown,
): Promise<JsonResult<{ ok: true } | { error: string }>> {
  const auth = await requireDevice(token, deviceId);
  if (!("ok" in auth)) return auth;
  const parsed = deviceSyncConfirmationSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid sync confirmation.");
  const now = isoNow();
  const { data: sync, error: syncError } = await auth.admin
    .from("device_sync_states")
    .select(
      "package_state, sync_state, pending_manifest_id, active_manifest_id, previous_manifest_id, cloud_manifest_version",
    )
    .eq("screen_id", auth.screen.id)
    .maybeSingle();
  throwIfError(syncError, "Could not load sync state.");
  const fromPackage = asString((sync as { package_state?: string } | null)?.package_state, "PENDING");
  const fromSync = asString((sync as { sync_state?: string } | null)?.sync_state, "WAITING");
  const nextPackage = parsed.data.packageState;
  if (
    isPackageState(fromPackage) &&
    fromPackage !== nextPackage &&
    !canTransitionPackage(fromPackage, nextPackage) &&
    nextPackage !== "FAILED"
  ) {
    // Device is source of truth after retries/reboots; still persist the reported state.
  }

  const { data: manifest } = await auth.admin
    .from("content_manifests")
    .select("id, manifest_version")
    .eq("screen_id", auth.screen.id)
    .eq("manifest_version", parsed.data.manifestVersion)
    .maybeSingle();
  const manifestId = asNullableString((manifest as { id?: string } | null)?.id);
  const nextSync = syncStateForPackage(nextPackage);
  const patch: Record<string, unknown> = {
    package_state: nextPackage,
    sync_state: nextSync,
    local_manifest_version: parsed.data.manifestVersion,
    last_error: parsed.data.error ?? null,
    updated_at: now,
  };
  if (nextPackage === "ACTIVE") {
    patch["previous_manifest_id"] = asNullableString(
      (sync as { active_manifest_id?: string | null } | null)?.active_manifest_id,
    );
    patch["active_manifest_id"] = manifestId;
    if (manifestId && manifestId === asNullableString((sync as { pending_manifest_id?: string | null } | null)?.pending_manifest_id)) {
      patch["pending_manifest_id"] = null;
    }
    patch["sync_requested_at"] = null;
    patch["sync_progress"] = 100;
    await auth.admin
      .from("screens")
      .update({
        local_manifest_version: parsed.data.manifestVersion,
        last_sync_at: now,
      })
      .eq("id", auth.screen.id);
  }
  if (nextPackage === "FAILED") {
    patch["last_error"] = parsed.data.error ?? "Package verification failed.";
  }
  if (sync) {
    const { error } = await auth.admin.from("device_sync_states").update(patch).eq("screen_id", auth.screen.id);
    throwIfError(error, "Could not update sync confirmation.");
  } else {
    const { error } = await auth.admin.from("device_sync_states").insert({
      screen_id: auth.screen.id,
      ...patch,
    });
    throwIfError(error, "Could not store sync confirmation.");
  }
  if (fromSync !== nextSync) {
    await auth.admin.from("sync_events").insert({
      screen_id: auth.screen.id,
      manifest_id: manifestId,
      from_state: isSyncState(fromSync) ? fromSync : null,
      to_state: nextSync,
      detail: parsed.data.error ?? `Package ${nextPackage}`,
    });
  }
  return ok({ ok: true });
}

export async function devicePlaybackLogs(
  deviceId: string,
  token: string | null,
  input: unknown,
): Promise<JsonResult<{ accepted: number } | { error: string }>> {
  const auth = await requireDevice(token, deviceId);
  if (!("ok" in auth)) return auth;
  const parsed = playbackLogBatchSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid playback log batch.");
  if (parsed.data.screenId !== auth.screen.id) return fail(403, "screenId does not match this device.");
  const rows = parsed.data.events.map((event) => ({
    batch_id: parsed.data.batchId,
    client_event_id: event.clientEventId,
    screen_id: auth.screen.id,
    campaign_id: event.campaignId ?? null,
    playlist_id: event.playlistId ?? null,
    media_id: event.mediaId,
    media_version_id: event.mediaVersionId ?? null,
    started_at: event.startedAt,
    ended_at: event.endedAt,
    duration_ms: event.durationMs,
    result: event.result,
  }));
  const { error } = await auth.admin.from("playback_logs").upsert(rows, {
    onConflict: "batch_id,client_event_id",
    ignoreDuplicates: true,
  });
  throwIfError(error, "Could not store playback logs.");
  return ok({ accepted: rows.length });
}

export async function deviceErrorLogs(
  deviceId: string,
  token: string | null,
  input: unknown,
): Promise<JsonResult<{ accepted: number } | { error: string }>> {
  const auth = await requireDevice(token, deviceId);
  if (!("ok" in auth)) return auth;
  const parsed = errorLogBatchSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid error log batch.");
  if (parsed.data.screenId !== auth.screen.id) return fail(403, "screenId does not match this device.");
  const rows = parsed.data.events.map((event) => ({
    level: "error",
    source: "device",
    message: event.message,
    context: {
      batchId: parsed.data.batchId,
      screenId: auth.screen.id,
      clientEventId: event.clientEventId,
      at: event.at,
      code: event.code,
      mediaId: event.mediaId ?? null,
      manifestVersion: event.manifestVersion ?? null,
    },
  }));
  const { error } = await auth.admin.from("system_logs").insert(rows);
  throwIfError(error, "Could not store error logs.");
  return ok({ accepted: rows.length });
}

export async function handleDeviceJson(
  work: () => Promise<JsonResult<unknown>>,
): Promise<JsonResult<unknown>> {
  try {
    return await work();
  } catch (err) {
    const status = typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 500;
    const message = err instanceof Error ? err.message : "Device request failed.";
    if (status === 400) return fail(400, message);
    console.error(err);
    return fail(status >= 400 ? status : 500, message);
  }
}
