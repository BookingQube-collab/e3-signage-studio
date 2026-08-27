import { formatLastActive } from "./relative-time.ts";
import type {
  ActivityItem,
  AlertItem,
  AvailabilityRow,
  CampaignPerformanceRow,
  DeviceLogLine,
  ProofOfPlayRow,
  Screen,
} from "../types/index.ts";

/** Admin pages refetch live heartbeats/sync acks about this often. */
export const ADMIN_MONITORING_REFETCH_MS = 30_000;

/** Pause the 30s poll while the browser tab is in the background. */
export function adminMonitoringRefetchInterval(): number | false {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
  return ADMIN_MONITORING_REFETCH_MS;
}

export const REPORT_WINDOW_DAYS = 30;
export const HEARTBEAT_INTERVAL_SECONDS = 120;
export const STORAGE_ALERT_RATIO = 0.85;
export const MAX_DASHBOARD_ALERTS = 8;
export const MAX_DASHBOARD_ACTIVITY = 8;

export type ScreenHealth = Pick<
  Screen,
  | "id"
  | "name"
  | "locationName"
  | "status"
  | "syncState"
  | "syncProgress"
  | "lastSeen"
  | "storageUsedGb"
  | "storageTotalGb"
> & {
  lastError?: string | null;
};

export type PlaybackEvent = {
  id: string;
  startedAt: string;
  durationMs: number;
  result: "COMPLETED" | "SKIPPED" | "ERROR" | "INTERRUPTED";
  screenId: string;
  screenName: string;
  locationName: string;
  campaignId: string | null;
  campaignName: string | null;
  playlistId: string | null;
  playlistName: string | null;
  mediaId: string;
  mediaName: string;
};

export type HeartbeatCoverage = {
  screenId: string;
  screenName: string;
  locationName: string;
  heartbeatCount: number;
  createdAtMs: number;
  lastHeartbeatAt: string | null;
};

export type SyncEventLite = {
  id: string;
  screenName: string;
  fromState: string | null;
  toState: string;
  detail: string | null;
  createdAt: string;
};

export type DeviceLogEvent = {
  id: string;
  at: string;
  source: DeviceLogLine["source"];
  message: string;
};

export function reportWindowStartMs(nowMs: number, days = REPORT_WINDOW_DAYS): number {
  return nowMs - days * 24 * 60 * 60 * 1000;
}

export function expectedHeartbeats(
  windowMs: number,
  intervalSeconds: number = HEARTBEAT_INTERVAL_SECONDS,
): number {
  if (windowMs <= 0 || intervalSeconds <= 0) return 0;
  return Math.floor(windowMs / (intervalSeconds * 1000));
}

export function coveragePercent(heartbeatCount: number, expected: number): number {
  if (expected <= 0) return heartbeatCount > 0 ? 100 : 0;
  return Math.min(100, Math.round((heartbeatCount / expected) * 100));
}

export function storageUsedRatio(usedGb: number, totalGb: number): number {
  if (!(totalGb > 0)) return 0;
  return usedGb / totalGb;
}

export function isStorageAlert(usedGb: number, totalGb: number): boolean {
  return storageUsedRatio(usedGb, totalGb) >= STORAGE_ALERT_RATIO;
}

function isoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function deriveAlerts(screens: ScreenHealth[], nowLabel = "just now"): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const screen of screens) {
    if (screen.status === "offline") {
      alerts.push({
        id: `offline-${screen.id}`,
        title: "Screen offline",
        detail: `${screen.name} · ${screen.locationName} · ${screen.lastSeen}`,
        severity: "critical",
        at: screen.lastSeen,
      });
      continue;
    }
    if (screen.status === "disabled") continue;
    if (screen.syncState === "Failed" || screen.lastError) {
      alerts.push({
        id: `sync-fail-${screen.id}`,
        title: "Sync failed",
        detail: `${screen.name} · ${screen.lastError ?? "Package verification failed."}`,
        severity: "warning",
        at: nowLabel,
      });
    }
    if (isStorageAlert(screen.storageUsedGb, screen.storageTotalGb)) {
      alerts.push({
        id: `storage-${screen.id}`,
        title: "Storage low",
        detail: `${screen.name} · ${screen.storageUsedGb.toFixed(1)} GB of ${screen.storageTotalGb.toFixed(1)} GB used`,
        severity: "warning",
        at: nowLabel,
      });
    }
    if (screen.status === "syncing" || screen.syncState === "Downloading" || screen.syncState === "Verifying") {
      alerts.push({
        id: `syncing-${screen.id}`,
        title: "Synchronization in progress",
        detail: `${screen.name} · ${screen.syncState.toLowerCase()} ${Math.round(screen.syncProgress)}%`,
        severity: "info",
        at: nowLabel,
      });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, MAX_DASHBOARD_ALERTS);
}

export function storageAlertCount(screens: ScreenHealth[]): number {
  return screens.filter((s) => isStorageAlert(s.storageUsedGb, s.storageTotalGb)).length;
}

export type DashboardNowPlaying = {
  id: string;
  name: string;
  locationName: string;
  nowPlaying: string | null;
  status: Screen["status"];
};

export type DashboardLocationStatus = {
  id: string;
  name: string;
  total: number;
  online: number;
};

export type DashboardFleetScreen = ScreenHealth & {
  locationId: string;
  nowPlaying: string | null;
};

/** Counts, alerts, and now-playing from already-loaded screen rows — no extra IO. */
export function summarizeDashboardFleet(input: {
  locations: Array<{ id: string; name: string; status: string }>;
  screens: DashboardFleetScreen[];
}): {
  locations: number;
  screens: number;
  online: number;
  offline: number;
  syncing: number;
  storageAlerts: number;
  locationStatus: DashboardLocationStatus[];
  nowPlaying: DashboardNowPlaying[];
  alerts: AlertItem[];
} {
  const visible = input.locations.filter((location) => location.status !== "Archived");
  const screens = input.screens;
  return {
    locations: visible.length,
    screens: screens.length,
    online: screens.filter((s) => s.status === "online").length,
    offline: screens.filter((s) => s.status === "offline").length,
    syncing: screens.filter((s) => s.status === "syncing").length,
    storageAlerts: storageAlertCount(screens),
    locationStatus: visible.map((location) => ({
      id: location.id,
      name: location.name,
      total: screens.filter((s) => s.locationId === location.id).length,
      online: screens.filter((s) => s.locationId === location.id && s.status === "online").length,
    })),
    nowPlaying: screens
      .filter((s) => s.nowPlaying)
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        name: s.name,
        locationName: s.locationName,
        nowPlaying: s.nowPlaying,
        status: s.status,
      })),
    alerts: deriveAlerts(screens),
  };
}

export function activityFromMonitoring(
  syncEvents: SyncEventLite[],
  screens: ScreenHealth[],
  nowMs: number = Date.now(),
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const event of syncEvents) {
    const at = formatLastActive(event.createdAt);
    if (event.toState === "ACTIVE" || event.toState === "READY") {
      items.push({
        id: event.id,
        message: `${event.screenName} synchronized`,
        detail: event.detail?.trim() || `Local package ${event.toState.toLowerCase()}`,
        kind: "sync",
        at,
      });
    } else if (event.toState === "FAILED") {
      items.push({
        id: event.id,
        message: `${event.screenName} sync failed`,
        detail: event.detail?.trim() || "Package verification failed",
        kind: "sync",
        at,
      });
    } else if (event.toState === "DOWNLOADING" || event.toState === "VERIFYING") {
      items.push({
        id: event.id,
        message: `${event.screenName} ${event.toState.toLowerCase()}`,
        detail: event.detail?.trim() || `From ${event.fromState ?? "WAITING"}`,
        kind: "sync",
        at,
      });
    } else if (event.toState === "OFFLINE") {
      items.push({
        id: event.id,
        message: `${event.screenName} went offline`,
        detail: event.detail?.trim() || "No recent heartbeat",
        kind: "offline",
        at,
      });
    }
  }
  for (const screen of screens) {
    if (screen.status !== "offline") continue;
    items.push({
      id: `offline-now-${screen.id}`,
      message: `${screen.name} went offline`,
      detail: `Last heartbeat ${screen.lastSeen}`,
      kind: "offline",
      at: screen.lastSeen,
    });
  }
  const seen = new Set<string>();
  const unique: ActivityItem[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  void nowMs;
  return unique.slice(0, MAX_DASHBOARD_ACTIVITY);
}

export function aggregateProofOfPlay(events: PlaybackEvent[]): ProofOfPlayRow[] {
  const groups = new Map<
    string,
    {
      date: string;
      location: string;
      screen: string;
      campaign: string;
      playlist: string;
      media: string;
      playCount: number;
      totalDurationMs: number;
      completed: number;
    }
  >();
  for (const event of events) {
    const date = isoDate(event.startedAt);
    const key = [date, event.screenId, event.campaignId ?? "", event.playlistId ?? "", event.mediaId].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.playCount += 1;
      existing.totalDurationMs += event.durationMs;
      if (event.result === "COMPLETED") existing.completed += 1;
      continue;
    }
    groups.set(key, {
      date,
      location: event.locationName,
      screen: event.screenName,
      campaign: event.campaignName ?? "—",
      playlist: event.playlistName ?? "—",
      media: event.mediaName,
      playCount: 1,
      totalDurationMs: event.durationMs,
      completed: event.result === "COMPLETED" ? 1 : 0,
    });
  }
  return [...groups.entries()]
    .map(([id, row]) => ({
      id,
      date: row.date,
      location: row.location,
      screen: row.screen,
      campaign: row.campaign,
      playlist: row.playlist,
      media: row.media,
      playCount: row.playCount,
      totalDurationMin: Math.round(row.totalDurationMs / 60_000),
      successRate: row.playCount === 0 ? 0 : Math.round((row.completed / row.playCount) * 100),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.playCount - a.playCount));
}

export function availabilityFromHeartbeats(
  rows: HeartbeatCoverage[],
  nowMs: number,
  intervalSeconds: number = HEARTBEAT_INTERVAL_SECONDS,
  windowDays: number = REPORT_WINDOW_DAYS,
): AvailabilityRow[] {
  const windowStart = reportWindowStartMs(nowMs, windowDays);
  return rows.map((row) => {
    const start = Math.max(windowStart, row.createdAtMs);
    const expected = expectedHeartbeats(nowMs - start, intervalSeconds);
    const onlinePct = coveragePercent(row.heartbeatCount, expected);
    return {
      screenId: row.screenId,
      screen: row.screenName,
      location: row.locationName,
      onlinePct,
      offlinePct: Math.max(0, 100 - onlinePct),
      lastSeen: formatLastActive(row.lastHeartbeatAt),
    };
  });
}

export function aggregateCampaignPerformance(
  events: PlaybackEvent[],
  screenCountsByCampaign: Map<string, number>,
): CampaignPerformanceRow[] {
  const groups = new Map<
    string,
    { campaign: string; screens: Set<string>; plays: number; durationMs: number; completed: number }
  >();
  for (const event of events) {
    const name = event.campaignName?.trim() || "Unassigned";
    const key = event.campaignId ?? name;
    const existing = groups.get(key);
    if (existing) {
      existing.screens.add(event.screenId);
      existing.plays += 1;
      existing.durationMs += event.durationMs;
      if (event.result === "COMPLETED") existing.completed += 1;
      continue;
    }
    groups.set(key, {
      campaign: name,
      screens: new Set([event.screenId]),
      plays: 1,
      durationMs: event.durationMs,
      completed: event.result === "COMPLETED" ? 1 : 0,
    });
  }
  return [...groups.entries()]
    .map(([key, row]) => ({
      campaign: row.campaign,
      screens: screenCountsByCampaign.get(key) ?? row.screens.size,
      plays: row.plays,
      hoursPlayed: Math.round((row.durationMs / 3_600_000) * 10) / 10,
      completionRate: row.plays === 0 ? 0 : Math.round((row.completed / row.plays) * 100),
    }))
    .sort((a, b) => b.plays - a.plays);
}

export function mergeDeviceLogLines(events: DeviceLogEvent[], limit = 80): DeviceLogLine[] {
  return [...events]
    .sort((a, b) => {
      const aAt = new Date(a.at).getTime();
      const bAt = new Date(b.at).getTime();
      return (Number.isNaN(bAt) ? 0 : bAt) - (Number.isNaN(aAt) ? 0 : aAt);
    })
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      at: formatLastActive(event.at),
      source: event.source,
      message: event.message,
    }));
}

export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => {
    if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
    return value;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\r\n");
}
