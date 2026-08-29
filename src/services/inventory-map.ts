import {
  invert,
  UI_LABELS,
  UI_LOCATION_STATUS,
  UI_LOCATION_TYPE,
  type DeviceSyncState,
  type LocationStatus as CanonicalLocationStatus,
  type LocationType as CanonicalLocationType,
  type Orientation as CanonicalOrientation,
  type ScreenOperationalStatus,
} from "@e3/shared-types";

import { formatLastActive } from "@/lib/relative-time";
import type { Location, Screen, ScreenGroup, ScreenStatus, SyncState } from "@/types";

export const LOCATION_TYPE_FROM_UI = invert(UI_LOCATION_TYPE);
export const LOCATION_STATUS_FROM_UI = invert(UI_LOCATION_STATUS);
export const ORIENTATION_FROM_UI = invert(UI_LABELS.orientation);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export type LocationRecord = {
  id: string;
  name: string;
  shortName: string;
  type: CanonicalLocationType;
  status: CanonicalLocationStatus;
  city: string;
  screenCount: number;
  onlineCount: number;
  activeCampaigns: number;
  createdAt: string;
  waitingMediaId: string | null;
  waitingMediaName: string | null;
  waitingThumbnailUrl: string | null;
  waitingTitle: string | null;
  waitingMessage: string | null;
};

export type ScreenRecord = {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  groupIds: string[];
  connectivity: "ONLINE" | "OFFLINE" | "DISABLED";
  operationalStatus: ScreenOperationalStatus;
  screenType: string;
  orientation: CanonicalOrientation;
  width: number;
  height: number;
  playlistId: string | null;
  playlistName: string | null;
  nowPlaying: string | null;
  nowPlayingMediaId: string | null;
  syncState: DeviceSyncState;
  syncProgress: number;
  lastHeartbeatAt: string | null;
  lastSyncAt: string | null;
  localManifestVersion: number | null;
  cloudManifestVersion: number | null;
  totalStorageBytes: number | null;
  availableStorageBytes: number | null;
  appVersion: string | null;
  lastError: string | null;
};

export type ScreenGroupRecord = {
  id: string;
  name: string;
  description: string;
  screenIds: string[];
};

export function toUiLocation(row: LocationRecord): Location {
  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    type: UI_LOCATION_TYPE[row.type],
    status: UI_LOCATION_STATUS[row.status],
    city: row.city,
    screenCount: row.screenCount,
    onlineCount: row.onlineCount,
    activeCampaigns: row.activeCampaigns,
    createdAt: row.createdAt.slice(0, 10),
    waitingMediaId: row.waitingMediaId,
    waitingMediaName: row.waitingMediaName,
    waitingThumbnailUrl: row.waitingThumbnailUrl,
    waitingTitle: row.waitingTitle,
    waitingMessage: row.waitingMessage,
  };
}

export function toUiScreenStatus(
  operational: ScreenOperationalStatus,
  connectivity: ScreenRecord["connectivity"],
  syncState: DeviceSyncState,
): ScreenStatus {
  if (operational === "DISABLED" || connectivity === "DISABLED") return "disabled";
  if (connectivity !== "ONLINE") return "offline";
  if (
    operational === "SYNCING" ||
    operational === "DOWNLOADING" ||
    operational === "VERIFYING" ||
    operational === "UPDATING" ||
    syncState === "DOWNLOADING" ||
    syncState === "VERIFYING"
  ) {
    return "syncing";
  }
  return "online";
}

function versionLabel(value: number | null): string {
  return value == null ? "—" : `v${value}`;
}

function bytesToGb(bytes: number | null): number {
  if (bytes == null || bytes <= 0) return 0;
  return bytes / 1_000_000_000;
}

export function toUiScreen(row: ScreenRecord): Screen {
  const usedBytes =
    row.totalStorageBytes != null && row.availableStorageBytes != null
      ? Math.max(0, row.totalStorageBytes - row.availableStorageBytes)
      : null;
  const syncLabel = UI_LABELS.syncState[row.syncState];
  return {
    id: row.id,
    name: row.name,
    locationId: row.locationId,
    locationName: row.locationName,
    groupIds: row.groupIds,
    status: toUiScreenStatus(row.operationalStatus, row.connectivity, row.syncState),
    screenType: row.screenType,
    orientation: UI_LABELS.orientation[row.orientation],
    resolution: `${row.width} × ${row.height}`,
    playlistId: row.playlistId,
    playlistName: row.playlistName,
    nowPlaying: row.nowPlaying,
    nowPlayingMediaId: row.nowPlayingMediaId,
    syncState: syncLabel as SyncState,
    syncProgress: row.syncProgress,
    lastSeen: formatLastActive(row.lastHeartbeatAt),
    lastSync: formatLastActive(row.lastSyncAt),
    localVersion: versionLabel(row.localManifestVersion),
    cloudVersion: versionLabel(row.cloudManifestVersion),
    storageUsedGb: bytesToGb(usedBytes),
    storageTotalGb: bytesToGb(row.totalStorageBytes),
    appVersion: row.appVersion ?? "—",
    lastError: row.lastError,
  };
}

export function toUiScreenGroup(row: ScreenGroupRecord): ScreenGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    screenIds: row.screenIds,
  };
}
