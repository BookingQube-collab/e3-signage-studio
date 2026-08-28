/** UI DTOs for Lovable pages. Canonical API enums: `@e3/shared-types`. */

export type LocationType =
  | "Permanent FEC"
  | "Temporary Event"
  | "Exhibition"
  | "Pop-up"
  | "Outdoor Event"
  | "Activation"
  | "Other";

export type LocationStatus = "Active" | "Upcoming" | "Inactive" | "Archived";

export interface Location {
  id: string;
  name: string;
  shortName: string;
  type: LocationType;
  status: LocationStatus;
  city: string;
  screenCount: number;
  onlineCount: number;
  activeCampaigns: number;
  createdAt: string;
}

export type ScreenStatus = "online" | "offline" | "syncing" | "disabled";
export type Orientation = "Landscape" | "Portrait";
export type SyncState =
  | "Waiting"
  | "Notified"
  | "Downloading"
  | "Verifying"
  | "Ready"
  | "Active"
  | "Failed"
  | "Offline";

export interface Screen {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  groupIds: string[];
  status: ScreenStatus;
  screenType: string;
  orientation: Orientation;
  resolution: string;
  playlistId: string | null;
  playlistName: string | null;
  nowPlaying: string | null;
  nowPlayingMediaId: string | null;
  syncState: SyncState;
  syncProgress: number;
  lastSeen: string;
  lastSync: string;
  localVersion: string;
  cloudVersion: string;
  storageUsedGb: number;
  storageTotalGb: number;
  appVersion: string;
  lastError: string | null;
}

export interface DeviceLogLine {
  id: string;
  at: string;
  source: "heartbeat" | "sync" | "playback" | "error";
  message: string;
}

export interface ScreenGroup {
  id: string;
  name: string;
  description: string;
  screenIds: string[];
}

export type MediaType = "Video" | "Image" | "QR" | "Logo";

export interface MediaFolder {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
  archivedAt?: string | null;
}

export interface Media {
  id: string;
  filename: string;
  type: MediaType;
  dimensions: string;
  durationSec: number | null;
  sizeMb: number;
  modifiedAt: string;
  uploadedBy: string;
  uploadedAt: string;
  version: string;
  thumbnailHue: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  folderId: string | null;
  folderName: string | null;
  usedIn: { playlists: string[]; campaigns: string[]; screens: string[] };
}

export type PlaylistStatus = "Draft" | "Active" | "Scheduled" | "Archived";
export type Transition = "Cut" | "Fade" | "Slide";

export interface PlaylistItem {
  id: string;
  mediaId: string;
  filename: string;
  type: MediaType;
  durationSec: number;
  transition: Transition;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  status: PlaylistStatus;
  items: PlaylistItem[];
  usedByScreens: number;
  modifiedAt: string;
}

export type ZoneContentType =
  | "Video"
  | "Image"
  | "Slideshow"
  | "Text"
  | "QR"
  | "Logo"
  | "Date"
  | "Time";
export type FitMode = "Fill" | "Cover" | "Contain" | "Stretch";

export interface LayoutZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentType: ZoneContentType;
  contentRef: string | null;
  fit: FitMode;
  background: string;
  durationSec: number;
}

export type LayoutPreset =
  | "Full Screen"
  | "50/50"
  | "70/30"
  | "30/70"
  | "Video + Side Banner"
  | "Video + Bottom Banner"
  | "3 Zones"
  | "4 Zones"
  | "Portrait"
  | "Custom";

export interface Layout {
  id: string;
  name: string;
  preset: LayoutPreset;
  orientation: Orientation;
  resolution: string;
  background: string;
  zones: LayoutZone[];
  modifiedAt: string;
  usedByScreens: number;
}

export type CampaignStatus =
  | "Draft"
  | "Scheduled"
  | "Publishing"
  | "Active"
  | "Paused"
  | "Expired"
  | "Ended"
  | "Archived";

export interface Schedule {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  days: string[];
  timezone: string;
  priority: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  contentType: "Playlist" | "Layout";
  contentId: string;
  contentName: string;
  locationIds: string[];
  screenIds: string[];
  schedule: Schedule;
  syncReady: number;
  syncTotal: number;
  modifiedAt: string;
}

export interface SyncStatusItem {
  screenId: string;
  screenName: string;
  locationName: string;
  state: SyncState;
  progress: number;
}

export type UserRole = "Super Admin" | "Marketing" | "Site Supervisor" | "Event Manager";

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role: UserRole;
  locationIds: string[];
  status: "Active" | "Invited" | "Disabled";
  lastActive: string;
}

export interface ActivityItem {
  id: string;
  message: string;
  detail: string;
  kind: "publish" | "sync" | "offline" | "upload" | "user";
  at: string;
}

export interface AlertItem {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  at: string;
}

export interface ProofOfPlayRow {
  id: string;
  date: string;
  location: string;
  screen: string;
  campaign: string;
  playlist: string;
  media: string;
  playCount: number;
  totalDurationMin: number;
  successRate: number;
}

export interface AvailabilityRow {
  screenId: string;
  screen: string;
  location: string;
  onlinePct: number;
  offlinePct: number;
  lastSeen: string;
}

export interface CampaignPerformanceRow {
  campaign: string;
  screens: number;
  plays: number;
  hoursPlayed: number;
  completionRate: number;
}
