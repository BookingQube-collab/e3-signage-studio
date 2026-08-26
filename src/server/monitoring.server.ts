import {
  activityFromMonitoring,
  aggregateCampaignPerformance,
  aggregateProofOfPlay,
  availabilityFromHeartbeats,
  HEARTBEAT_INTERVAL_SECONDS,
  mergeDeviceLogLines,
  REPORT_WINDOW_DAYS,
  reportWindowStartMs,
  type DeviceLogEvent,
  type HeartbeatCoverage,
  type PlaybackEvent,
  type SyncEventLite,
} from "@/lib/monitoring";
import type {
  ActivityItem,
  AvailabilityRow,
  CampaignPerformanceRow,
  DeviceLogLine,
  ProofOfPlayRow,
} from "@/types";

import { requireCmsPermission } from "./auth.server";
import { getServiceRoleClient, getUserClient, isServiceRoleConfigured } from "./supabase.server";

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

function windowIso(nowMs = Date.now()): string {
  return new Date(reportWindowStartMs(nowMs, REPORT_WINDOW_DAYS)).toISOString();
}

function privilegedClient(userClient: ReturnType<typeof getUserClient>) {
  return isServiceRoleConfigured() ? getServiceRoleClient() : userClient;
}

function nameMap(rows: Array<{ id?: unknown; name?: unknown }> | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    const id = asString(row.id);
    if (id) map.set(id, asString(row.name) || "—");
  }
  return map;
}

type ScreenMeta = {
  name: string;
  locationId: string;
  createdAt: string;
  lastHeartbeatAt: string | null;
};

async function loadNameMaps(
  client: ReturnType<typeof getUserClient>,
  screenIds: string[],
  campaignIds: string[],
  playlistIds: string[],
  mediaIds: string[],
): Promise<{
  screens: Map<string, ScreenMeta>;
  locations: Map<string, string>;
  campaigns: Map<string, string>;
  playlists: Map<string, string>;
  media: Map<string, string>;
}> {
  const uniqueScreens = [...new Set(screenIds.filter(Boolean))];
  const [{ data: screens, error: screenError }, { data: campaigns, error: campaignError }, { data: playlists, error: playlistError }, { data: media, error: mediaError }] =
    await Promise.all([
      uniqueScreens.length
        ? client
            .from("screens")
            .select("id, name, location_id, created_at, last_heartbeat_at")
            .in("id", uniqueScreens)
        : Promise.resolve({ data: [], error: null }),
      campaignIds.length
        ? client.from("campaigns").select("id, name").in("id", [...new Set(campaignIds)])
        : Promise.resolve({ data: [], error: null }),
      playlistIds.length
        ? client.from("playlists").select("id, name").in("id", [...new Set(playlistIds)])
        : Promise.resolve({ data: [], error: null }),
      mediaIds.length
        ? client.from("media").select("id, name").in("id", [...new Set(mediaIds)])
        : Promise.resolve({ data: [], error: null }),
    ]);
  throwIfError(screenError, "Could not load screens.");
  throwIfError(campaignError, "Could not load campaigns.");
  throwIfError(playlistError, "Could not load playlists.");
  throwIfError(mediaError, "Could not load media.");

  const screenRows = (screens ?? []) as Array<{
    id: string;
    name: string;
    location_id: string;
    created_at: string;
    last_heartbeat_at: string | null;
  }>;
  const locationIds = [...new Set(screenRows.map((s) => s.location_id))];
  const { data: locations, error: locError } = locationIds.length
    ? await client.from("locations").select("id, name, short_name").in("id", locationIds)
    : { data: [], error: null };
  throwIfError(locError, "Could not load locations.");
  const locationNames = new Map<string, string>();
  for (const row of locations ?? []) {
    const raw = row as { id: string; name: string; short_name: string | null };
    locationNames.set(raw.id, asString(raw.short_name) || asString(raw.name));
  }

  const screenMap = new Map<string, ScreenMeta>();
  for (const row of screenRows) {
    screenMap.set(row.id, {
      name: row.name,
      locationId: row.location_id,
      createdAt: row.created_at,
      lastHeartbeatAt: row.last_heartbeat_at,
    });
  }

  return {
    screens: screenMap,
    locations: locationNames,
    campaigns: nameMap(campaigns as Array<{ id: unknown; name: unknown }> | null),
    playlists: nameMap(playlists as Array<{ id: unknown; name: unknown }> | null),
    media: nameMap(media as Array<{ id: unknown; name: unknown }> | null),
  };
}

function toPlaybackEvents(
  rows: Array<{
    id: string;
    started_at: string;
    duration_ms: number;
    result: PlaybackEvent["result"];
    screen_id: string;
    campaign_id: string | null;
    playlist_id: string | null;
    media_id: string;
  }>,
  names: Awaited<ReturnType<typeof loadNameMaps>>,
): PlaybackEvent[] {
  return rows.map((row) => {
    const screen = names.screens.get(row.screen_id);
    return {
      id: row.id,
      startedAt: row.started_at,
      durationMs: asNumber(row.duration_ms, 0),
      result: row.result,
      screenId: row.screen_id,
      screenName: screen?.name ?? "—",
      locationName: screen ? (names.locations.get(screen.locationId) ?? "—") : "—",
      campaignId: row.campaign_id,
      campaignName: row.campaign_id ? (names.campaigns.get(row.campaign_id) ?? null) : null,
      playlistId: row.playlist_id,
      playlistName: row.playlist_id ? (names.playlists.get(row.playlist_id) ?? null) : null,
      mediaId: row.media_id,
      mediaName: names.media.get(row.media_id) ?? "—",
    };
  });
}

export async function listDashboardActivity(accessToken: string): Promise<ActivityItem[]> {
  const auth = await requireCmsPermission(accessToken, "dashboard.view");
  const client = getUserClient(accessToken);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: screens, error: screenError } = await client
    .from("screens")
    .select("id, name")
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null);
  throwIfError(screenError, "Could not load screens.");
  const screenRows = (screens ?? []) as Array<{ id: string; name: string }>;
  const screenIds = screenRows.map((s) => s.id);
  const reader = privilegedClient(client);
  const { data: events, error: eventError } = screenIds.length
    ? await reader
        .from("sync_events")
        .select("id, screen_id, from_state, to_state, detail, created_at")
        .in("screen_id", screenIds)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [], error: null };
  throwIfError(eventError, "Could not load sync events.");
  const names = new Map(screenRows.map((s) => [s.id, s.name]));
  const syncEvents: SyncEventLite[] = (
    (events ?? []) as Array<{
      id: string;
      screen_id: string;
      from_state: string | null;
      to_state: string;
      detail: string | null;
      created_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    screenName: names.get(row.screen_id) ?? "Screen",
    fromState: row.from_state,
    toState: row.to_state,
    detail: row.detail,
    createdAt: row.created_at,
  }));
  return activityFromMonitoring(syncEvents, [], Date.now());
}

export async function listProofOfPlay(accessToken: string): Promise<ProofOfPlayRow[]> {
  await requireCmsPermission(accessToken, "reports.view");
  const client = getUserClient(accessToken);
  const since = windowIso();
  const rpc = await client.rpc("proof_of_play_since", { p_since: since });
  if (!rpc.error && Array.isArray(rpc.data)) {
    const grouped = rpc.data as Array<{
      day: string;
      screen_id: string;
      campaign_id: string | null;
      playlist_id: string | null;
      media_id: string;
      play_count: number | string;
      total_duration_ms: number | string;
      completed_count: number | string;
    }>;
    const names = await loadNameMaps(
      client,
      grouped.map((r) => r.screen_id),
      grouped.map((r) => r.campaign_id).filter((id): id is string => Boolean(id)),
      grouped.map((r) => r.playlist_id).filter((id): id is string => Boolean(id)),
      grouped.map((r) => r.media_id),
    );
    return grouped
      .map((row) => {
        const screen = names.screens.get(row.screen_id);
        const playCount = asNumber(row.play_count, 0);
        const completed = asNumber(row.completed_count, 0);
        return {
          id: [row.day, row.screen_id, row.campaign_id ?? "", row.playlist_id ?? "", row.media_id].join("|"),
          date: asString(row.day).slice(0, 10),
          location: screen ? (names.locations.get(screen.locationId) ?? "—") : "—",
          screen: screen?.name ?? "—",
          campaign: row.campaign_id ? (names.campaigns.get(row.campaign_id) ?? "—") : "—",
          playlist: row.playlist_id ? (names.playlists.get(row.playlist_id) ?? "—") : "—",
          media: names.media.get(row.media_id) ?? "—",
          playCount,
          totalDurationMin: Math.round(asNumber(row.total_duration_ms, 0) / 60_000),
          successRate: playCount === 0 ? 0 : Math.round((completed / playCount) * 100),
        } satisfies ProofOfPlayRow;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.playCount - a.playCount));
  }

  const { data, error } = await client
    .from("playback_logs")
    .select("id, started_at, duration_ms, result, screen_id, campaign_id, playlist_id, media_id")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(5000);
  throwIfError(error, "Could not load proof-of-play logs.");
  const rows = (data ?? []) as Array<{
    id: string;
    started_at: string;
    duration_ms: number;
    result: PlaybackEvent["result"];
    screen_id: string;
    campaign_id: string | null;
    playlist_id: string | null;
    media_id: string;
  }>;
  const names = await loadNameMaps(
    client,
    rows.map((r) => r.screen_id),
    rows.map((r) => r.campaign_id).filter((id): id is string => Boolean(id)),
    rows.map((r) => r.playlist_id).filter((id): id is string => Boolean(id)),
    rows.map((r) => r.media_id),
  );
  return aggregateProofOfPlay(toPlaybackEvents(rows, names));
}

export async function listAvailability(accessToken: string): Promise<AvailabilityRow[]> {
  const auth = await requireCmsPermission(accessToken, "reports.view");
  const client = getUserClient(accessToken);
  const nowMs = Date.now();
  const since = windowIso(nowMs);
  const { data: screens, error } = await client
    .from("screens")
    .select("id, name, location_id, created_at, last_heartbeat_at")
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .order("name");
  throwIfError(error, "Could not load screens.");
  const screenRows = (screens ?? []) as Array<{
    id: string;
    name: string;
    location_id: string;
    created_at: string;
    last_heartbeat_at: string | null;
  }>;
  if (screenRows.length === 0) return [];

  const locationIds = [...new Set(screenRows.map((s) => s.location_id))];
  const { data: locations, error: locError } = await client
    .from("locations")
    .select("id, name, short_name")
    .in("id", locationIds);
  throwIfError(locError, "Could not load locations.");
  const locationNames = new Map<string, string>();
  for (const row of locations ?? []) {
    const raw = row as { id: string; name: string; short_name: string | null };
    locationNames.set(raw.id, asString(raw.short_name) || asString(raw.name));
  }

  const counts = new Map<string, { heartbeatCount: number; lastReceived: string | null }>();
  const rpc = await client.rpc("heartbeat_coverage_since", { p_since: since });
  if (!rpc.error && Array.isArray(rpc.data)) {
    for (const row of rpc.data as Array<{
      screen_id: string;
      heartbeat_count: number | string;
      last_received: string | null;
    }>) {
      counts.set(row.screen_id, {
        heartbeatCount: asNumber(row.heartbeat_count, 0),
        lastReceived: row.last_received,
      });
    }
  } else {
    await Promise.all(
      screenRows.map(async (screen) => {
        const { count, error: countError } = await client
          .from("device_heartbeats")
          .select("id", { count: "exact", head: true })
          .eq("screen_id", screen.id)
          .gte("received_at", since);
        throwIfError(countError, "Could not load heartbeat coverage.");
        counts.set(screen.id, {
          heartbeatCount: count ?? 0,
          lastReceived: screen.last_heartbeat_at,
        });
      }),
    );
  }

  const coverage: HeartbeatCoverage[] = screenRows.map((screen) => {
    const hit = counts.get(screen.id);
    return {
      screenId: screen.id,
      screenName: screen.name,
      locationName: locationNames.get(screen.location_id) ?? "—",
      heartbeatCount: hit?.heartbeatCount ?? 0,
      createdAtMs: new Date(screen.created_at).getTime() || nowMs,
      lastHeartbeatAt: hit?.lastReceived ?? screen.last_heartbeat_at,
    };
  });
  return availabilityFromHeartbeats(coverage, nowMs, HEARTBEAT_INTERVAL_SECONDS);
}

export async function listCampaignPerformance(accessToken: string): Promise<CampaignPerformanceRow[]> {
  await requireCmsPermission(accessToken, "reports.view");
  const client = getUserClient(accessToken);
  const since = windowIso();
  const { data, error } = await client
    .from("playback_logs")
    .select("id, started_at, duration_ms, result, screen_id, campaign_id, playlist_id, media_id")
    .gte("started_at", since)
    .not("campaign_id", "is", null)
    .order("started_at", { ascending: false })
    .limit(5000);
  throwIfError(error, "Could not load campaign playback.");
  const rows = (data ?? []) as Array<{
    id: string;
    started_at: string;
    duration_ms: number;
    result: PlaybackEvent["result"];
    screen_id: string;
    campaign_id: string | null;
    playlist_id: string | null;
    media_id: string;
  }>;
  const names = await loadNameMaps(
    client,
    rows.map((r) => r.screen_id),
    rows.map((r) => r.campaign_id).filter((id): id is string => Boolean(id)),
    [],
    [],
  );
  const events = toPlaybackEvents(rows, names);
  const byCampaign = new Map<string, Set<string>>();
  for (const event of events) {
    const key = event.campaignId ?? event.campaignName ?? "—";
    const set = byCampaign.get(key) ?? new Set<string>();
    set.add(event.screenId);
    byCampaign.set(key, set);
  }
  const counts = new Map([...byCampaign.entries()].map(([key, set]) => [key, set.size]));
  return aggregateCampaignPerformance(events, counts);
}

export async function listDeviceLogs(accessToken: string, screenId: string): Promise<DeviceLogLine[]> {
  await requireCmsPermission(accessToken, "screens.view");
  const client = getUserClient(accessToken);
  const { data: screen, error: screenError } = await client
    .from("screens")
    .select("id")
    .eq("id", screenId)
    .maybeSingle();
  throwIfError(screenError, "Could not load screen.");
  if (!screen) throw new Error("Screen not found.");

  const reader = privilegedClient(client);
  const [{ data: heartbeats, error: hbError }, { data: syncs, error: syncError }, { data: plays, error: playError }, { data: errors, error: errError }] =
    await Promise.all([
      client
        .from("device_heartbeats")
        .select("id, received_at, operational_status, sync_state, last_error")
        .eq("screen_id", screenId)
        .order("received_at", { ascending: false })
        .limit(8),
      reader
        .from("sync_events")
        .select("id, created_at, from_state, to_state, detail")
        .eq("screen_id", screenId)
        .order("created_at", { ascending: false })
        .limit(40),
      client
        .from("playback_logs")
        .select("id, started_at, result, duration_ms, media_id")
        .eq("screen_id", screenId)
        .order("started_at", { ascending: false })
        .limit(40),
      reader
        .from("system_logs")
        .select("id, created_at, message, context")
        .eq("source", "device")
        .contains("context", { screenId })
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  throwIfError(hbError, "Could not load heartbeats.");
  throwIfError(syncError, "Could not load sync events.");
  throwIfError(playError, "Could not load playback logs.");
  throwIfError(errError, "Could not load device errors.");

  const mediaIds = [
    ...new Set(
      ((plays ?? []) as Array<{ media_id: string | null }>)
        .map((row) => row.media_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const mediaNames = mediaIds.length
    ? nameMap(
        ((await client.from("media").select("id, name").in("id", mediaIds)).data ?? []) as Array<{
          id: unknown;
          name: unknown;
        }>,
      )
    : new Map<string, string>();

  const events: DeviceLogEvent[] = [];
  for (const row of (heartbeats ?? []) as Array<{
    id: string;
    received_at: string;
    operational_status: string | null;
    sync_state: string | null;
    last_error: string | null;
  }>) {
    events.push({
      id: `hb-${row.id}`,
      at: row.received_at,
      source: "heartbeat",
      message: row.last_error
        ? `Heartbeat ${row.operational_status ?? "READY"} · ${row.last_error}`
        : `Heartbeat ${row.operational_status ?? "READY"} · sync ${row.sync_state ?? "WAITING"}`,
    });
  }
  for (const row of (syncs ?? []) as Array<{
    id: string;
    created_at: string;
    from_state: string | null;
    to_state: string;
    detail: string | null;
  }>) {
    events.push({
      id: `sync-${row.id}`,
      at: row.created_at,
      source: "sync",
      message: `Sync ${asString(row.from_state, "—")} → ${row.to_state}${row.detail ? ` · ${row.detail}` : ""}`,
    });
  }
  for (const row of (plays ?? []) as Array<{
    id: string;
    started_at: string;
    result: string;
    duration_ms: number;
    media_id: string | null;
  }>) {
    const media = row.media_id ? (mediaNames.get(row.media_id) ?? "media") : "media";
    events.push({
      id: `play-${row.id}`,
      at: row.started_at,
      source: "playback",
      message: `Played ${media} · ${row.result.toLowerCase()} · ${Math.round(asNumber(row.duration_ms, 0) / 1000)}s`,
    });
  }
  for (const row of (errors ?? []) as Array<{ id: string; created_at: string; message: string }>) {
    events.push({
      id: `err-${row.id}`,
      at: row.created_at,
      source: "error",
      message: row.message,
    });
  }
  return mergeDeviceLogLines(events);
}
