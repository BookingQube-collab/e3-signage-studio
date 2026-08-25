/**
 * Canonical enums and ID brands for E3 Digital Signage.
 * Display labels for the Lovable UI live in `ui-labels.ts`.
 */

export type Uuid = string & { readonly __brand: "uuid" };

export const LOCATION_TYPES = [
  "PERMANENT_FEC",
  "TEMPORARY_EVENT",
  "EXHIBITION",
  "POPUP",
  "OUTDOOR_EVENT",
  "ACTIVATION",
  "OTHER",
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_STATUSES = ["ACTIVE", "UPCOMING", "INACTIVE", "ARCHIVED"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const USER_ROLES = ["SUPER_ADMIN", "MARKETING", "SITE_SUPERVISOR", "EVENT_MANAGER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "INVITED", "DISABLED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ORIENTATIONS = ["LANDSCAPE", "PORTRAIT"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** Operational status reported/derived for a screen. Connectivity is separate. */
export const SCREEN_OPERATIONAL_STATUSES = [
  "READY",
  "SYNCING",
  "DOWNLOADING",
  "VERIFYING",
  "UPDATING",
  "ERROR",
  "DISABLED",
] as const;
export type ScreenOperationalStatus = (typeof SCREEN_OPERATIONAL_STATUSES)[number];

export const CONNECTIVITY_STATUSES = ["ONLINE", "OFFLINE"] as const;
export type ConnectivityStatus = (typeof CONNECTIVITY_STATUSES)[number];

export const DEVICE_SYNC_STATES = [
  "WAITING",
  "NOTIFIED",
  "DOWNLOADING",
  "VERIFYING",
  "READY",
  "ACTIVE",
  "FAILED",
  "OFFLINE",
] as const;
export type DeviceSyncState = (typeof DEVICE_SYNC_STATES)[number];

export const CONTENT_PACKAGE_STATES = [
  "PENDING",
  "DOWNLOADING",
  "VERIFYING",
  "READY",
  "ACTIVE",
  "FAILED",
] as const;
export type ContentPackageState = (typeof CONTENT_PACKAGE_STATES)[number];

export const MEDIA_TYPES = ["VIDEO", "IMAGE", "QR", "LOGO"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_STATUSES = ["PROCESSING", "READY", "FAILED", "ARCHIVED"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const PLAYLIST_STATUSES = ["DRAFT", "ACTIVE", "SCHEDULED", "ARCHIVED"] as const;
export type PlaylistStatus = (typeof PLAYLIST_STATUSES)[number];

export const TRANSITIONS = ["CUT", "FADE", "SLIDE", "ZOOM", "NONE"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const ZONE_CONTENT_TYPES = [
  "VIDEO",
  "IMAGE",
  "SLIDESHOW",
  "TEXT",
  "QR",
  "LOGO",
  "CLOCK",
  "DATE",
] as const;
export type ZoneContentType = (typeof ZONE_CONTENT_TYPES)[number];

export const FIT_MODES = ["FIT", "FILL", "COVER", "CONTAIN", "STRETCH"] as const;
export type FitMode = (typeof FIT_MODES)[number];

export const LAYOUT_PRESETS = [
  "FULL_SCREEN",
  "SPLIT_50_50",
  "SPLIT_70_30",
  "SPLIT_30_70",
  "VIDEO_SIDE_BANNER",
  "VIDEO_BOTTOM_BANNER",
  "ZONES_3",
  "ZONES_4",
  "PORTRAIT",
  "CUSTOM",
] as const;
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
  "ARCHIVED",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TARGET_TYPES = [
  "SCREEN",
  "SCREEN_GROUP",
  "LOCATION",
  "ORGANIZATION",
] as const;
export type CampaignTargetType = (typeof CAMPAIGN_TARGET_TYPES)[number];

export const PLAYBACK_RESULTS = ["COMPLETED", "SKIPPED", "ERROR", "INTERRUPTED"] as const;
export type PlaybackResult = (typeof PLAYBACK_RESULTS)[number];

export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * Canonical priority: higher number wins.
 * UI currently uses 1 as “highest” — convert at the API boundary.
 */
export const PRIORITY = {
  EMERGENCY: 100,
  SPECIAL_EVENT: 80,
  CAMPAIGN: 50,
  NORMAL: 10,
} as const;
export type PriorityLevel = (typeof PRIORITY)[keyof typeof PRIORITY];

export const EVENT_LOCATION_TYPES: readonly LocationType[] = [
  "TEMPORARY_EVENT",
  "EXHIBITION",
  "POPUP",
  "OUTDOOR_EVENT",
  "ACTIVATION",
];
