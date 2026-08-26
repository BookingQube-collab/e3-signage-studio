import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TARGET_TYPES,
  DEVICE_SYNC_STATES,
  EVENT_LOCATION_TYPES,
  UI_LABELS,
  type CampaignStatus,
  type CampaignTargetType,
  type DeviceSyncState,
  type MediaType,
} from "@e3/shared-types";

import { campaignLifecycleStatus } from "@/lib/campaign-window";
import { daysToNumbers, numbersToDays, uiTime } from "@/lib/schedule-days";
import { toManifestAssets } from "@/lib/manifest-assets";
import { isPlaylistSnapshotStale } from "@/lib/playlist-snapshot";
import {
  campaignIdsTargetingScreen,
  resolveTargetScreenIds,
  type GroupLite,
  type ScreenLite,
} from "@/lib/target-resolve";
import type { CmsProfile } from "@/lib/auth-types";
import { isUuid } from "@/services/inventory-map";
import type { CampaignRecord } from "@/services/campaign-map";
import type { SyncStatusItem } from "@/types";
import { canonicalPriorityToUi, pickWinningSchedule, uiPriorityToCanonical } from "./priority";
import { requireCmsPermission } from "./auth.server";
import { getServiceRoleClient, getUserClient } from "./supabase.server";

const CAMPAIGN_SELECT =
  "id, organization_id, name, description, playlist_id, layout_id, status, emergency, archived_at, created_at, updated_at, created_by";

export type CampaignWriteInput = {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  contentType: "Playlist" | "Layout";
  contentId: string;
  screenIds: string[];
  schedule: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    days: string[];
    timezone: string;
    priority: number;
  };
};

type UserClient = ReturnType<typeof getUserClient> | ReturnType<typeof getServiceRoleClient>;

type DbCampaign = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  playlist_id: string | null;
  layout_id: string | null;
  status: string;
  emergency: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type ManifestAsset = {
  mediaId: string;
  mediaVersionId: string;
  checksumSha256: string;
  fileSize: number;
  localFilename: string;
  assetType: MediaType;
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

function isCampaignStatus(value: string): value is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

function isTargetType(value: string): value is CampaignTargetType {
  return (CAMPAIGN_TARGET_TYPES as readonly string[]).includes(value);
}

function isSyncState(value: string): value is DeviceSyncState {
  return (DEVICE_SYNC_STATES as readonly string[]).includes(value);
}

function dateLabel(iso: string): string {
  return iso.slice(0, 10);
}

function asDayNums(value: unknown): number[] {
  if (!Array.isArray(value)) return [0, 1, 2, 3, 4, 5, 6];
  return value.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function assertScreenAccess(profile: CmsProfile, locationId: string, locationType: string): void {
  if (profile.role === "SUPER_ADMIN" || profile.role === "MARKETING") return;
  if (!profile.locationIds.includes(locationId)) {
    throw new Error("You do not have access to this location.");
  }
  if (profile.role === "EVENT_MANAGER") {
    const allowed = new Set<string>(EVENT_LOCATION_TYPES);
    if (!allowed.has(locationType)) {
      throw new Error("Event Managers can only target temporary/event locations.");
    }
  }
}

function contentFields(input: CampaignWriteInput): {
  playlist_id: string | null;
  layout_id: string | null;
} {
  if (!input.contentId) return { playlist_id: null, layout_id: null };
  if (!isUuid(input.contentId)) throw new Error("Choose content from the library.");
  if (input.contentType === "Playlist") return { playlist_id: input.contentId, layout_id: null };
  return { playlist_id: null, layout_id: input.contentId };
}

function publishStatus(schedule: CampaignWriteInput["schedule"]): CampaignStatus {
  const life = campaignLifecycleStatus({
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    timezone: schedule.timezone || "Asia/Qatar",
  });
  if (life === "Ended") {
    throw new Error("This campaign window has already ended.");
  }
  return life === "Scheduled" ? "SCHEDULED" : "ACTIVE";
}

function defaultSchedule(row?: {
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  days_of_week?: unknown;
  timezone?: string;
  priority?: number;
}): CampaignRecord["schedule"] {
  if (!row) {
    return {
      startDate: "",
      endDate: "",
      startTime: "00:00",
      endTime: "23:59",
      days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      timezone: "Asia/Qatar",
      priority: 6,
    };
  }
  return {
    startDate: dateLabel(asString(row.start_date)),
    endDate: dateLabel(asString(row.end_date)),
    startTime: uiTime(asString(row.start_time, "00:00")),
    endTime: uiTime(asString(row.end_time, "23:59")),
    days: numbersToDays(asDayNums(row.days_of_week)),
    timezone: asString(row.timezone, "Asia/Qatar"),
    priority: canonicalPriorityToUi(asNumber(row.priority, 50)),
  };
}

async function loadGroups(client: UserClient, organizationId: string): Promise<GroupLite[]> {
  const { data: groups, error } = await client
    .from("screen_groups")
    .select("id")
    .eq("organization_id", organizationId);
  throwIfError(error, "Could not load screen groups.");
  const ids = (groups ?? []).map((row) => asString((row as { id: string }).id)).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: members, error: memberError } = await client
    .from("screen_group_members")
    .select("screen_group_id, screen_id")
    .in("screen_group_id", ids);
  throwIfError(memberError, "Could not load screen group members.");
  const byGroup = new Map<string, string[]>();
  for (const raw of members ?? []) {
    const groupId = asString((raw as { screen_group_id: string }).screen_group_id);
    const screenId = asString((raw as { screen_id: string }).screen_id);
    const list = byGroup.get(groupId) ?? [];
    list.push(screenId);
    byGroup.set(groupId, list);
  }
  return ids.map((id) => ({ id, screenIds: byGroup.get(id) ?? [] }));
}

async function loadOrgScreens(client: UserClient, organizationId: string): Promise<ScreenLite[]> {
  const { data, error } = await client
    .from("screens")
    .select("id, location_id, organization_id, operational_status, archived_at")
    .eq("organization_id", organizationId);
  throwIfError(error, "Could not load screens.");
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: asString(row["id"]),
      locationId: asString(row["location_id"]),
      organizationId: asString(row["organization_id"]),
      operationalStatus: asString(row["operational_status"], "READY"),
      archivedAt: asNullableString(row["archived_at"]),
    };
  });
}

async function assertSelectedScreens(
  client: UserClient,
  profile: CmsProfile,
  screenIds: string[],
): Promise<void> {
  const unique = [...new Set(screenIds.filter(isUuid))];
  if (unique.length === 0) return;
  const { data, error } = await client
    .from("screens")
    .select("id, location_id")
    .eq("organization_id", profile.organizationId)
    .in("id", unique);
  throwIfError(error, "Could not load target screens.");
  const rows = (data ?? []) as Array<{ id: string; location_id: string }>;
  if (rows.length !== unique.length) {
    throw new Error("One or more target screens were not found.");
  }
  const locationIds = [...new Set(rows.map((row) => row.location_id))];
  const { data: locations, error: locError } = await client
    .from("locations")
    .select("id, type")
    .in("id", locationIds);
  throwIfError(locError, "Could not load locations.");
  const types = new Map(
    (locations ?? []).map((row) => [
      asString((row as { id: string }).id),
      asString((row as { type: string }).type),
    ]),
  );
  for (const row of rows) {
    assertScreenAccess(profile, row.location_id, types.get(row.location_id) ?? "");
  }
}

async function validateContent(
  client: UserClient,
  organizationId: string,
  input: CampaignWriteInput,
  requireReady: boolean,
): Promise<void> {
  const fields = contentFields(input);
  if (!requireReady && !fields.playlist_id && !fields.layout_id) return;
  if (fields.playlist_id && fields.layout_id) {
    throw new Error("A campaign must use a playlist or a layout, not both.");
  }
  if (!fields.playlist_id && !fields.layout_id) {
    throw new Error("Select a playlist or layout before publishing.");
  }
  if (fields.playlist_id) {
    const { data, error } = await client
      .from("playlists")
      .select("id, archived_at")
      .eq("id", fields.playlist_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    throwIfError(error, "Could not load playlist.");
    if (!data || asNullableString((data as { archived_at: string | null }).archived_at)) {
      throw new Error("Playlist not found.");
    }
    const { data: items, error: itemError } = await client
      .from("playlist_items")
      .select("media_id")
      .eq("playlist_id", fields.playlist_id);
    throwIfError(itemError, "Could not load playlist items.");
    const mediaIds = [
      ...new Set((items ?? []).map((row) => asString((row as { media_id: string }).media_id))),
    ].filter(Boolean);
    if (requireReady && mediaIds.length === 0) {
      throw new Error("The selected playlist has no media.");
    }
    await assertMediaReady(client, organizationId, mediaIds);
    return;
  }
  if (fields.layout_id) {
    const { data, error } = await client
      .from("layouts")
      .select("id, archived_at")
      .eq("id", fields.layout_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    throwIfError(error, "Could not load layout.");
    if (!data || asNullableString((data as { archived_at: string | null }).archived_at)) {
      throw new Error("Layout not found.");
    }
    const { data: zones, error: zoneError } = await client
      .from("layout_zones")
      .select("content_ref")
      .eq("layout_id", fields.layout_id);
    throwIfError(zoneError, "Could not load layout zones.");
    const refs = (zones ?? [])
      .map((row) => asNullableString((row as { content_ref: string | null }).content_ref))
      .filter((ref): ref is string => Boolean(ref));
    const mediaIds = await resolveMediaIds(client, organizationId, refs);
    if (requireReady) await assertMediaReady(client, organizationId, mediaIds);
  }
}

async function resolveMediaIds(
  client: UserClient,
  organizationId: string,
  refs: string[],
): Promise<string[]> {
  const unique = [...new Set(refs)];
  const ids = unique.filter(isUuid);
  const names = unique.filter((ref) => !isUuid(ref));
  const found = new Set<string>();
  if (ids.length > 0) {
    const { data, error } = await client
      .from("media")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", ids);
    throwIfError(error, "Could not load media.");
    for (const row of data ?? []) found.add(asString((row as { id: string }).id));
  }
  if (names.length > 0) {
    const { data, error } = await client
      .from("media")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("name", names);
    throwIfError(error, "Could not load media.");
    for (const row of data ?? []) found.add(asString((row as { id: string }).id));
  }
  return [...found];
}

async function assertMediaReady(
  client: UserClient,
  organizationId: string,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) return;
  const { data, error } = await client
    .from("media")
    .select("id, status, current_version_id")
    .eq("organization_id", organizationId)
    .in("id", mediaIds);
  throwIfError(error, "Could not load media.");
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    current_version_id: string | null;
  }>;
  if (rows.length !== mediaIds.length) {
    throw new Error("One or more media items were not found in the library.");
  }
  for (const row of rows) {
    if (row.status !== "READY" || !row.current_version_id) {
      throw new Error("Every media item in this campaign must be ready. Finish uploads first.");
    }
  }
}

async function collectAssets(
  client: UserClient,
  organizationId: string,
  playlistId: string | null,
  layoutId: string | null,
): Promise<ManifestAsset[]> {
  const mediaIds: string[] = [];
  if (playlistId) {
    const { data, error } = await client
      .from("playlist_items")
      .select("media_id")
      .eq("playlist_id", playlistId);
    throwIfError(error, "Could not load playlist items.");
    for (const row of data ?? []) mediaIds.push(asString((row as { media_id: string }).media_id));
  } else if (layoutId) {
    const { data, error } = await client
      .from("layout_zones")
      .select("content_ref")
      .eq("layout_id", layoutId);
    throwIfError(error, "Could not load layout zones.");
    const refs = (data ?? [])
      .map((row) => asNullableString((row as { content_ref: string | null }).content_ref))
      .filter((ref): ref is string => Boolean(ref));
    mediaIds.push(...(await resolveMediaIds(client, organizationId, refs)));
  }
  const unique = [...new Set(mediaIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const { data: mediaRows, error: mediaError } = await client
    .from("media")
    .select("id, name, type, current_version_id, status")
    .eq("organization_id", organizationId)
    .in("id", unique);
  throwIfError(mediaError, "Could not load media for the manifest.");
  const versionIds = (mediaRows ?? [])
    .map((row) => asNullableString((row as { current_version_id: string | null }).current_version_id))
    .filter((id): id is string => Boolean(id));
  const { data: versions, error: versionError } = versionIds.length
    ? await client
        .from("media_versions")
        .select("id, media_id, checksum_sha256, size_bytes, mime_type")
        .in("id", versionIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  throwIfError(versionError, "Could not load media versions.");
  return toManifestAssets(
    (mediaRows ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: asString(row["id"]),
        name: asString(row["name"], asString(row["id"])),
        type: asString(row["type"], "IMAGE"),
        currentVersionId: asNullableString(row["current_version_id"]),
        status: asString(row["status"]),
      };
    }),
    (versions ?? []).map((row) => ({
      id: asString(row["id"]),
      checksumSha256: asString(row["checksum_sha256"]),
      sizeBytes: asNumber(row["size_bytes"]),
    })),
  );
}

function visibleToProfile(
  profile: CmsProfile,
  screenIds: string[],
  locationByScreen: Map<string, string>,
  createdBy: string | null,
): boolean {
  if (profile.role !== "EVENT_MANAGER") return true;
  if (screenIds.some((id) => profile.locationIds.includes(locationByScreen.get(id) ?? ""))) {
    return true;
  }
  return screenIds.length === 0 && createdBy === profile.id;
}

async function toRecords(
  client: UserClient,
  profile: CmsProfile,
  rows: DbCampaign[],
): Promise<CampaignRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [
    { data: targetRows, error: targetError },
    { data: scheduleRows, error: scheduleError },
    { data: syncRows, error: syncError },
  ] = await Promise.all([
    client.from("campaign_targets").select("campaign_id, type, target_id").in("campaign_id", ids),
    client
      .from("schedules")
      .select(
        "campaign_id, start_date, end_date, start_time, end_time, days_of_week, timezone, priority",
      )
      .in("campaign_id", ids),
    client
      .from("device_sync_states")
      .select("screen_id, sync_state, pending_manifest_id, active_manifest_id"),
  ]);
  throwIfError(targetError, "Could not load campaign targets.");
  throwIfError(scheduleError, "Could not load schedules.");
  throwIfError(syncError, "Could not load sync state.");

  const screens = await loadOrgScreens(client, profile.organizationId);
  const groups = await loadGroups(client, profile.organizationId);
  const locationByScreen = new Map(screens.map((screen) => [screen.id, screen.locationId]));

  const playlistIds = [
    ...new Set(rows.map((row) => row.playlist_id).filter((id): id is string => Boolean(id))),
  ];
  const layoutIds = [
    ...new Set(rows.map((row) => row.layout_id).filter((id): id is string => Boolean(id))),
  ];
  const [{ data: playlists }, { data: layouts }] = await Promise.all([
    playlistIds.length
      ? client.from("playlists").select("id, name").in("id", playlistIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    layoutIds.length
      ? client.from("layouts").select("id, name").in("id", layoutIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const playlistNames = new Map(
    (playlists ?? []).map((row) => [asString((row as { id: string }).id), asString((row as { name: string }).name)]),
  );
  const layoutNames = new Map(
    (layouts ?? []).map((row) => [asString((row as { id: string }).id), asString((row as { name: string }).name)]),
  );

  const targetsByCampaign = new Map<
    string,
    Array<{ type: CampaignTargetType; targetId: string | null }>
  >();
  for (const raw of targetRows ?? []) {
    const row = raw as { campaign_id: string; type: string; target_id: string | null };
    const type = isTargetType(row.type) ? row.type : "SCREEN";
    const list = targetsByCampaign.get(row.campaign_id) ?? [];
    list.push({ type, targetId: row.target_id });
    targetsByCampaign.set(row.campaign_id, list);
  }
  const scheduleByCampaign = new Map<string, CampaignRecord["schedule"]>();
  for (const raw of scheduleRows ?? []) {
    const row = raw as Record<string, unknown>;
    scheduleByCampaign.set(asString(row["campaign_id"]), defaultSchedule(row));
  }

  const readyStates = new Set(["READY", "ACTIVE"]);
  const syncByScreen = new Map<string, { ready: boolean }>();
  for (const raw of syncRows ?? []) {
    const row = raw as { screen_id: string; sync_state: string };
    syncByScreen.set(row.screen_id, { ready: readyStates.has(row.sync_state) });
  }

  const out: CampaignRecord[] = [];
  for (const row of rows) {
    if (row.archived_at) continue;
    const status = isCampaignStatus(row.status) ? row.status : "DRAFT";
    const targets = targetsByCampaign.get(row.id) ?? [];
    const screenIds = resolveTargetScreenIds(targets, screens, groups);
    if (!visibleToProfile(profile, screenIds, locationByScreen, row.created_by)) continue;
    const locationIds = [...new Set(screenIds.map((id) => locationByScreen.get(id)).filter(Boolean))] as string[];
    const contentType = row.layout_id ? "Layout" : "Playlist";
    const contentId = row.layout_id ?? row.playlist_id ?? "";
    const contentName = row.layout_id
      ? (layoutNames.get(row.layout_id) ?? "—")
      : row.playlist_id
        ? (playlistNames.get(row.playlist_id) ?? "—")
        : "—";
    const syncReady = screenIds.filter((id) => syncByScreen.get(id)?.ready).length;
    out.push({
      id: row.id,
      name: row.name,
      description: row.description,
      status,
      contentType,
      contentId,
      contentName,
      locationIds,
      screenIds,
      schedule: scheduleByCampaign.get(row.id) ?? defaultSchedule(),
      syncReady,
      syncTotal: screenIds.length,
      modifiedAt: dateLabel(row.updated_at),
    });
  }
  return out;
}

async function persistCampaign(
  accessToken: string,
  input: CampaignWriteInput,
  status: CampaignStatus,
): Promise<string> {
  const auth = await requireCmsPermission(accessToken, "campaigns.manage");
  const client = getUserClient(accessToken);
  const name = input.name.trim();
  if (!name) throw new Error("Name the campaign before saving.");

  const requireContent = status !== "DRAFT";
  if (requireContent) {
    if (input.screenIds.filter(isUuid).length === 0) {
      throw new Error("Select at least one screen.");
    }
    if (!input.schedule.startDate || !input.schedule.endDate) {
      throw new Error("Set a start and end date.");
    }
    if (input.schedule.endDate < input.schedule.startDate) {
      throw new Error("End date must be on or after the start date.");
    }
    if (daysToNumbers(input.schedule.days).length === 0) {
      throw new Error("Select at least one day of the week.");
    }
    await validateContent(client, auth.profile.organizationId, input, true);
  } else if (input.contentId) {
    await validateContent(client, auth.profile.organizationId, input, false);
  }

  await assertSelectedScreens(client, auth.profile, input.screenIds);

  const fields = contentFields(input);
  const existingId = isUuid(input.id) ? input.id : null;
  let campaignId = existingId;
  if (existingId) {
    const { data: existing, error: existingError } = await client
      .from("campaigns")
      .select("id")
      .eq("id", existingId)
      .eq("organization_id", auth.profile.organizationId)
      .maybeSingle();
    throwIfError(existingError, "Could not load campaign.");
    if (!existing) throw new Error("Campaign not found.");
    const { error: updateError } = await client
      .from("campaigns")
      .update({
        name,
        description: input.description.trim(),
        status,
        playlist_id: fields.playlist_id,
        layout_id: fields.layout_id,
      })
      .eq("id", existingId);
    throwIfError(updateError, "Could not save campaign.");
  } else {
    const { data, error } = await client
      .from("campaigns")
      .insert({
        organization_id: auth.profile.organizationId,
        name,
        description: input.description.trim(),
        status,
        playlist_id: fields.playlist_id,
        layout_id: fields.layout_id,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    throwIfError(error, "Could not create campaign.");
    campaignId = asString((data as { id: string }).id);
  }
  if (!campaignId) throw new Error("Could not save campaign.");

  const { error: deleteTargets } = await client
    .from("campaign_targets")
    .delete()
    .eq("campaign_id", campaignId);
  throwIfError(deleteTargets, "Could not update campaign targets.");
  const screenIds = [...new Set(input.screenIds.filter(isUuid))];
  if (screenIds.length > 0) {
    const { error: insertTargets } = await client.from("campaign_targets").insert(
      screenIds.map((target_id) => ({
        campaign_id: campaignId,
        type: "SCREEN",
        target_id,
      })),
    );
    throwIfError(insertTargets, "Could not save campaign targets.");
  }

  const { error: deleteSchedules } = await client.from("schedules").delete().eq("campaign_id", campaignId);
  throwIfError(deleteSchedules, "Could not update schedule.");
  if (input.schedule.startDate && input.schedule.endDate) {
    const { error: insertSchedule } = await client.from("schedules").insert({
      campaign_id: campaignId,
      start_date: input.schedule.startDate,
      end_date: input.schedule.endDate,
      start_time: uiTime(input.schedule.startTime || "00:00"),
      end_time: uiTime(input.schedule.endTime || "23:59"),
      days_of_week: daysToNumbers(input.schedule.days),
      timezone: input.schedule.timezone || "Asia/Qatar",
      priority: uiPriorityToCanonical(input.schedule.priority || 1),
    });
    throwIfError(insertSchedule, "Could not save schedule.");
  }

  return campaignId;
}

type ContestRow = {
  id: string;
  emergency: boolean;
  createdAt: Date;
  createdBy: string | null;
  playlistId: string | null;
  layoutId: string | null;
  status: string;
  schedule: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    days: number[];
    timezone: string;
    priority: number;
    startAt: Date;
  };
  targets: Array<{ type: CampaignTargetType; targetId: string | null }>;
};

async function loadContest(client: UserClient, organizationId: string): Promise<ContestRow[]> {
  const { data: campaigns, error } = await client
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("status", ["ACTIVE", "SCHEDULED"]);
  throwIfError(error, "Could not load campaigns for publish.");
  const rows = (campaigns ?? []) as DbCampaign[];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [{ data: targetRows, error: targetError }, { data: scheduleRows, error: scheduleError }] =
    await Promise.all([
      client.from("campaign_targets").select("campaign_id, type, target_id").in("campaign_id", ids),
      client
        .from("schedules")
        .select(
          "campaign_id, start_date, end_date, start_time, end_time, days_of_week, timezone, priority",
        )
        .in("campaign_id", ids),
    ]);
  throwIfError(targetError, "Could not load campaign targets.");
  throwIfError(scheduleError, "Could not load schedules.");
  const targetsByCampaign = new Map<string, ContestRow["targets"]>();
  for (const raw of targetRows ?? []) {
    const row = raw as { campaign_id: string; type: string; target_id: string | null };
    const type = isTargetType(row.type) ? row.type : "SCREEN";
    const list = targetsByCampaign.get(row.campaign_id) ?? [];
    list.push({ type, targetId: row.target_id });
    targetsByCampaign.set(row.campaign_id, list);
  }
  const scheduleByCampaign = new Map<string, Record<string, unknown>>();
  for (const raw of scheduleRows ?? []) {
    const row = raw as Record<string, unknown>;
    scheduleByCampaign.set(asString(row["campaign_id"]), row);
  }
  return rows.flatMap((row) => {
    const schedule = scheduleByCampaign.get(row.id);
    if (!schedule) return [];
    const startDate = dateLabel(asString(schedule["start_date"]));
    const startTime = uiTime(asString(schedule["start_time"], "00:00"));
    return [
      {
        id: row.id,
        emergency: Boolean(row.emergency),
        createdAt: new Date(row.created_at),
        createdBy: row.created_by,
        playlistId: row.playlist_id,
        layoutId: row.layout_id,
        status: row.status,
        schedule: {
          startDate,
          endDate: dateLabel(asString(schedule["end_date"])),
          startTime,
          endTime: uiTime(asString(schedule["end_time"], "23:59")),
          days: asDayNums(schedule["days_of_week"]),
          timezone: asString(schedule["timezone"], "Asia/Qatar"),
          priority: asNumber(schedule["priority"], 50),
          startAt: new Date(`${startDate}T${startTime}:00`),
        },
        targets: targetsByCampaign.get(row.id) ?? [],
      },
    ];
  });
}

async function writeManifestForScreen(
  client: UserClient,
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
  userId: string,
  screen: ScreenLite,
  winner: ContestRow,
): Promise<void> {
  const assets = await collectAssets(client, organizationId, winner.playlistId, winner.layoutId);
  const { data: latest, error: latestError } = await admin
    .from("content_manifests")
    .select("manifest_version")
    .eq("screen_id", screen.id)
    .order("manifest_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(latestError, "Could not load existing manifests.");
  const nextVersion = asNumber((latest as { manifest_version?: number } | null)?.manifest_version, 0) + 1;
  const payload = {
    campaignId: winner.id,
    playlistId: winner.playlistId,
    layoutId: winner.layoutId,
    schedule: {
      startDate: winner.schedule.startDate,
      endDate: winner.schedule.endDate,
      startTime: winner.schedule.startTime,
      endTime: winner.schedule.endTime,
      daysOfWeek: winner.schedule.days,
      timezone: winner.schedule.timezone,
      priority: winner.schedule.priority,
    },
    assets: assets.map((asset) => ({
      mediaId: asset.mediaId,
      mediaVersionId: asset.mediaVersionId,
      checksumSha256: asset.checksumSha256,
      sizeBytes: asset.fileSize,
      type: asset.assetType,
    })),
  };
  const { data: manifest, error: manifestError } = await admin
    .from("content_manifests")
    .insert({
      screen_id: screen.id,
      campaign_id: winner.id,
      manifest_version: nextVersion,
      config_version: 1,
      payload,
      created_by: userId && isUuid(userId) ? userId : null,
    })
    .select("id")
    .single();
  throwIfError(manifestError, "Could not create content manifest.");
  const manifestId = asString((manifest as { id: string }).id);
  if (assets.length > 0) {
    const { error: assetError } = await admin.from("manifest_assets").insert(
      assets.map((asset) => ({
        manifest_id: manifestId,
        media_id: asset.mediaId,
        media_version_id: asset.mediaVersionId,
        checksum_sha256: asset.checksumSha256,
        file_size: asset.fileSize,
        local_filename: asset.localFilename,
        asset_type: asset.assetType,
      })),
    );
    throwIfError(assetError, "Could not save manifest assets.");
  }

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("device_sync_states")
    .select("screen_id, sync_state")
    .eq("screen_id", screen.id)
    .maybeSingle();
  throwIfError(existingError, "Could not load device sync state.");
  const fromState = asString((existing as { sync_state?: string } | null)?.sync_state, "WAITING");
  const syncPatch = {
    cloud_manifest_version: nextVersion,
    pending_manifest_id: manifestId,
    package_state: "PENDING",
    sync_state: "NOTIFIED",
    sync_progress: 0,
    sync_requested_at: now,
    last_error: null,
    updated_at: now,
  };
  if (existing) {
    const { error } = await admin.from("device_sync_states").update(syncPatch).eq("screen_id", screen.id);
    throwIfError(error, "Could not update device sync state.");
  } else {
    const { error } = await admin.from("device_sync_states").insert({
      screen_id: screen.id,
      ...syncPatch,
    });
    throwIfError(error, "Could not create device sync state.");
  }
  const { error: eventError } = await admin.from("sync_events").insert({
    screen_id: screen.id,
    manifest_id: manifestId,
    from_state: isSyncState(fromState) ? fromState : "WAITING",
    to_state: "NOTIFIED",
    detail: `Campaign ${winner.id} published`,
  });
  throwIfError(eventError, "Could not record sync event.");

  const { error: screenError } = await admin
    .from("screens")
    .update({
      cloud_manifest_version: nextVersion,
      current_playlist_id: winner.playlistId,
    })
    .eq("id", screen.id);
  throwIfError(screenError, "Could not update screen manifest version.");
}

/** Push an empty package so a stopped campaign leaves the screen without unpairing it. */
async function writeIdleManifestForScreen(
  admin: ReturnType<typeof getServiceRoleClient>,
  userId: string,
  screen: ScreenLite,
): Promise<void> {
  const { data: latest, error: latestError } = await admin
    .from("content_manifests")
    .select("manifest_version")
    .eq("screen_id", screen.id)
    .order("manifest_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(latestError, "Could not load existing manifests.");
  const nextVersion = asNumber((latest as { manifest_version?: number } | null)?.manifest_version, 0) + 1;
  const { data: manifest, error: manifestError } = await admin
    .from("content_manifests")
    .insert({
      screen_id: screen.id,
      campaign_id: null,
      manifest_version: nextVersion,
      config_version: 1,
      payload: { campaignId: null, playlistId: null, layoutId: null, schedule: null, assets: [] },
      created_by: userId && isUuid(userId) ? userId : null,
    })
    .select("id")
    .single();
  throwIfError(manifestError, "Could not create idle content package.");
  const manifestId = asString((manifest as { id: string }).id);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("device_sync_states")
    .select("screen_id, sync_state")
    .eq("screen_id", screen.id)
    .maybeSingle();
  throwIfError(existingError, "Could not load device sync state.");
  const fromState = asString((existing as { sync_state?: string } | null)?.sync_state, "WAITING");
  const syncPatch = {
    cloud_manifest_version: nextVersion,
    pending_manifest_id: manifestId,
    package_state: "PENDING",
    sync_state: "NOTIFIED",
    sync_progress: 0,
    sync_requested_at: now,
    last_error: null,
    updated_at: now,
  };
  if (existing) {
    const { error } = await admin.from("device_sync_states").update(syncPatch).eq("screen_id", screen.id);
    throwIfError(error, "Could not update device sync state.");
  } else {
    const { error } = await admin.from("device_sync_states").insert({
      screen_id: screen.id,
      ...syncPatch,
    });
    throwIfError(error, "Could not create device sync state.");
  }
  const { error: eventError } = await admin.from("sync_events").insert({
    screen_id: screen.id,
    manifest_id: manifestId,
    from_state: isSyncState(fromState) ? fromState : "WAITING",
    to_state: "NOTIFIED",
    detail: "Campaign stopped — idle package",
  });
  throwIfError(eventError, "Could not record sync event.");
  const { error: screenError } = await admin
    .from("screens")
    .update({
      cloud_manifest_version: nextVersion,
      current_playlist_id: null,
    })
    .eq("id", screen.id);
  throwIfError(screenError, "Could not update screen manifest version.");
}

async function notifyScreens(
  accessToken: string,
  screenIds: string[],
  opts: { onlyIfCampaignId?: string },
): Promise<void> {
  if (screenIds.length === 0) return;
  const auth = await requireCmsPermission(accessToken, "campaigns.view");
  const client = getUserClient(accessToken);
  const admin = getServiceRoleClient();
  const screens = await loadOrgScreens(client, auth.profile.organizationId);
  const groups = await loadGroups(client, auth.profile.organizationId);
  const contest = await loadContest(client, auth.profile.organizationId);
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const targets = contest.flatMap((campaign) =>
    campaign.targets.map((target) => ({
      campaignId: campaign.id,
      type: target.type,
      targetId: target.targetId,
    })),
  );

  for (const screenId of [...new Set(screenIds)]) {
    const screen = byId.get(screenId);
    if (!screen) continue;
    if (screen.archivedAt || screen.operationalStatus === "DISABLED") continue;
    if (auth.profile.role === "EVENT_MANAGER" && !auth.profile.locationIds.includes(screen.locationId)) {
      continue;
    }
    const campaignIds = new Set(campaignIdsTargetingScreen(screen, targets, groups));
    const candidates = contest
      .filter((campaign) => campaignIds.has(campaign.id))
      .map((campaign) => ({
        campaignId: campaign.id,
        emergency: campaign.emergency,
        priority: campaign.schedule.priority,
        startAt: campaign.schedule.startAt,
        createdAt: campaign.createdAt,
      }));
    const winnerPick = pickWinningSchedule(candidates);
    if (!winnerPick) {
      if (!opts.onlyIfCampaignId) {
        await writeIdleManifestForScreen(admin, auth.userId, screen);
      }
      continue;
    }
    if (opts.onlyIfCampaignId && winnerPick.campaignId !== opts.onlyIfCampaignId) continue;
    const winner = contest.find((campaign) => campaign.id === winnerPick.campaignId);
    if (!winner) continue;
    await writeManifestForScreen(
      client,
      admin,
      auth.profile.organizationId,
      auth.userId,
      screen,
      winner,
    );
  }
}

function winnerForScreen(
  screen: ScreenLite,
  contest: ContestRow[],
  groups: GroupLite[],
): ContestRow | null {
  const targets = contest.flatMap((campaign) =>
    campaign.targets.map((target) => ({
      campaignId: campaign.id,
      type: target.type,
      targetId: target.targetId,
    })),
  );
  const campaignIds = new Set(campaignIdsTargetingScreen(screen, targets, groups));
  const candidates = contest
    .filter((campaign) => campaignIds.has(campaign.id))
    .map((campaign) => ({
      campaignId: campaign.id,
      emergency: campaign.emergency,
      priority: campaign.schedule.priority,
      startAt: campaign.schedule.startAt,
      createdAt: campaign.createdAt,
    }));
  const pick = pickWinningSchedule(candidates);
  if (!pick) return null;
  return contest.find((campaign) => campaign.id === pick.campaignId) ?? null;
}

async function frozenAssetVersionIds(
  admin: ReturnType<typeof getServiceRoleClient>,
  screenId: string,
): Promise<string[]> {
  const { data: sync } = await admin
    .from("device_sync_states")
    .select("pending_manifest_id, active_manifest_id")
    .eq("screen_id", screenId)
    .maybeSingle();
  const pendingId = asNullableString(
    (sync as { pending_manifest_id?: string | null } | null)?.pending_manifest_id,
  );
  const activeId = asNullableString(
    (sync as { active_manifest_id?: string | null } | null)?.active_manifest_id,
  );
  let manifestId = pendingId ?? activeId;
  if (!manifestId) {
    const { data: latest } = await admin
      .from("content_manifests")
      .select("id")
      .eq("screen_id", screenId)
      .order("manifest_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    manifestId = asNullableString((latest as { id?: string } | null)?.id);
  }
  if (!manifestId) return [];
  const { data: rows } = await admin
    .from("manifest_assets")
    .select("media_version_id")
    .eq("manifest_id", manifestId);
  return (rows ?? []).map((row) => asString((row as { media_version_id: string }).media_version_id));
}

/** Rebuild packages for live campaigns that use this playlist so screens get new items. */
export async function republishScreensUsingPlaylist(
  accessToken: string,
  playlistId: string,
): Promise<number> {
  if (!isUuid(playlistId)) return 0;
  const auth = await requireCmsPermission(accessToken, "campaigns.view");
  const client = getUserClient(accessToken);
  const contest = await loadContest(client, auth.profile.organizationId);
  const using = contest.filter((campaign) => campaign.playlistId === playlistId);
  if (using.length === 0) return 0;
  const screens = await loadOrgScreens(client, auth.profile.organizationId);
  const groups = await loadGroups(client, auth.profile.organizationId);
  const screenIds = new Set<string>();
  for (const campaign of using) {
    for (const id of resolveTargetScreenIds(campaign.targets, screens, groups)) {
      screenIds.add(id);
    }
  }
  await notifyScreens(accessToken, [...screenIds], {});
  return screenIds.size;
}

/**
 * If the live playlist has assets the frozen package does not ship, bump a new
 * manifest version. Sync Now alone cannot invent those missing files.
 */
export async function republishScreenIfPlaylistStale(
  screenId: string,
  organizationId: string,
): Promise<boolean> {
  if (!isUuid(screenId) || !isUuid(organizationId)) return false;
  const admin = getServiceRoleClient();
  const screens = await loadOrgScreens(admin, organizationId);
  const screen = screens.find((row) => row.id === screenId);
  if (!screen || screen.archivedAt || screen.operationalStatus === "DISABLED") return false;
  const groups = await loadGroups(admin, organizationId);
  const contest = await loadContest(admin, organizationId);
  const winner = winnerForScreen(screen, contest, groups);
  if (!winner) return false;
  const live = await collectAssets(admin, organizationId, winner.playlistId, winner.layoutId);
  const frozen = await frozenAssetVersionIds(admin, screenId);
  if (
    !isPlaylistSnapshotStale(
      live.map((asset) => asset.mediaVersionId),
      frozen,
    )
  ) {
    return false;
  }
  await writeManifestForScreen(
    admin,
    admin,
    organizationId,
    winner.createdBy ?? "",
    screen,
    winner,
  );
  return true;
}

export async function listCampaigns(accessToken: string): Promise<CampaignRecord[]> {
  const auth = await requireCmsPermission(accessToken, "campaigns.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  throwIfError(error, "Could not load campaigns.");
  return toRecords(client, auth.profile, (data ?? []) as DbCampaign[]);
}

export async function listScheduledCampaigns(accessToken: string): Promise<CampaignRecord[]> {
  const auth = await requireCmsPermission(accessToken, "schedule.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  throwIfError(error, "Could not load schedule.");
  const rows = await toRecords(client, auth.profile, (data ?? []) as DbCampaign[]);
  return rows.filter((row) => row.status !== "DRAFT" && row.status !== "ARCHIVED");
}

export async function getCampaign(accessToken: string, id: string): Promise<CampaignRecord | null> {
  const auth = await requireCmsPermission(accessToken, "campaigns.view");
  if (!isUuid(id)) return null;
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId)
    .maybeSingle();
  throwIfError(error, "Could not load campaign.");
  if (!data) return null;
  const rows = await toRecords(client, auth.profile, [data as DbCampaign]);
  return rows[0] ?? null;
}

export async function saveCampaign(
  accessToken: string,
  input: CampaignWriteInput,
): Promise<CampaignRecord> {
  const persistStatus: CampaignStatus =
    input.status === "PAUSED" || input.status === "ARCHIVED" ? input.status : "DRAFT";
  const id = await persistCampaign(accessToken, input, persistStatus);
  if (persistStatus === "PAUSED") {
    await notifyScreens(accessToken, input.screenIds.filter(isUuid), {});
  }
  const saved = await getCampaign(accessToken, id);
  if (!saved) throw new Error("Campaign not found.");
  return saved;
}

export async function publishCampaign(
  accessToken: string,
  input: CampaignWriteInput,
): Promise<CampaignRecord> {
  const auth = await requireCmsPermission(accessToken, "campaigns.publish");
  const client = getUserClient(accessToken);
  const previous = isUuid(input.id) ? await getCampaign(accessToken, input.id) : null;
  const previousScreenIds = previous?.screenIds ?? [];
  const screens = await loadOrgScreens(client, auth.profile.organizationId);
  const eligible = resolveTargetScreenIds(
    input.screenIds.filter(isUuid).map((id) => ({ type: "SCREEN" as const, targetId: id })),
    screens,
    [],
  );
  if (eligible.length === 0) {
    throw new Error("None of the selected screens can receive this campaign.");
  }
  const status = publishStatus(input.schedule);
  const id = await persistCampaign(accessToken, { ...input, status }, status);
  const targeted = [...new Set(input.screenIds.filter(isUuid))];
  const removed = previousScreenIds.filter((screenId) => !targeted.includes(screenId));
  await notifyScreens(accessToken, targeted, { onlyIfCampaignId: id });
  await notifyScreens(accessToken, removed, {});
  const saved = await getCampaign(accessToken, id);
  if (!saved) throw new Error("Campaign not found.");
  return saved;
}

export async function archiveCampaign(accessToken: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new Error("Campaign not found.");
  const existing = await getCampaign(accessToken, id);
  if (!existing) throw new Error("Campaign not found.");
  const auth = await requireCmsPermission(accessToken, "campaigns.manage");
  const client = getUserClient(accessToken);
  const { error } = await client
    .from("campaigns")
    .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId);
  throwIfError(error, "Could not delete campaign.");
  await notifyScreens(accessToken, existing.screenIds.filter(isUuid), {});
}

export async function campaignSyncStatus(
  accessToken: string,
  campaignId: string,
): Promise<SyncStatusItem[]> {
  const campaign = await getCampaign(accessToken, campaignId);
  if (!campaign) return [];
  const auth = await requireCmsPermission(accessToken, "campaigns.view");
  const client = getUserClient(accessToken);
  if (campaign.screenIds.length === 0) return [];
  const [{ data: screens, error: screenError }, { data: syncRows, error: syncError }] = await Promise.all([
    client
      .from("screens")
      .select("id, name, location_id")
      .eq("organization_id", auth.profile.organizationId)
      .in("id", campaign.screenIds),
    client
      .from("device_sync_states")
      .select("screen_id, sync_state, sync_progress")
      .in("screen_id", campaign.screenIds),
  ]);
  throwIfError(screenError, "Could not load screens.");
  throwIfError(syncError, "Could not load sync state.");
  const locationIds = [
    ...new Set((screens ?? []).map((row) => asString((row as { location_id: string }).location_id))),
  ].filter(Boolean);
  const { data: locations, error: locError } = locationIds.length
    ? await client.from("locations").select("id, name, short_name").in("id", locationIds)
    : { data: [] as Array<{ id: string; name: string; short_name: string }>, error: null };
  throwIfError(locError, "Could not load locations.");
  const locationNames = new Map(
    (locations ?? []).map((row) => [
      asString((row as { id: string }).id),
      asString((row as { short_name: string }).short_name) || asString((row as { name: string }).name),
    ]),
  );
  const syncByScreen = new Map(
    (syncRows ?? []).map((row) => [
      asString((row as { screen_id: string }).screen_id),
      row as { screen_id: string; sync_state: string; sync_progress: number },
    ]),
  );
  return (screens ?? []).map((raw) => {
    const row = raw as { id: string; name: string; location_id: string };
    const sync = syncByScreen.get(row.id);
    const canonical = sync && isSyncState(sync.sync_state) ? sync.sync_state : "WAITING";
    return {
      screenId: row.id,
      screenName: row.name,
      locationName: locationNames.get(row.location_id) ?? "—",
      state: UI_LABELS.syncState[canonical],
      progress: Math.max(0, Math.min(100, asNumber(sync?.sync_progress, 0))),
    };
  });
}
