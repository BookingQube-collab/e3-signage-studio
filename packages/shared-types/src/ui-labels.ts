import type { LayoutPreset, LocationStatus, LocationType, UserRole } from "./enums";

export const UI_LOCATION_TYPE = {
  PERMANENT_FEC: "Permanent FEC",
  TEMPORARY_EVENT: "Temporary Event",
  EXHIBITION: "Exhibition",
  POPUP: "Pop-up",
  OUTDOOR_EVENT: "Outdoor Event",
  ACTIVATION: "Activation",
  OTHER: "Other",
} as const satisfies Record<LocationType, string>;

export const UI_LOCATION_STATUS = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
} as const satisfies Record<LocationStatus, string>;

export const UI_ROLE = {
  SUPER_ADMIN: "Super Admin",
  MARKETING: "Marketing",
  SITE_SUPERVISOR: "Site Supervisor",
  EVENT_MANAGER: "Event Manager",
} as const satisfies Record<UserRole, string>;

export const UI_LAYOUT_PRESET = {
  FULL_SCREEN: "Full Screen",
  SPLIT_50_50: "50/50",
  SPLIT_70_30: "70/30",
  SPLIT_30_70: "30/70",
  VIDEO_SIDE_BANNER: "Video + Side Banner",
  VIDEO_BOTTOM_BANNER: "Video + Bottom Banner",
  ZONES_3: "3 Zones",
  ZONES_4: "4 Zones",
  PORTRAIT: "Portrait",
  CUSTOM: "Custom",
} as const satisfies Record<LayoutPreset, string>;

export type UiLocationType = (typeof UI_LOCATION_TYPE)[LocationType];
export type UiLocationStatus = (typeof UI_LOCATION_STATUS)[LocationStatus];
export type UiUserRole = (typeof UI_ROLE)[UserRole];
export type UiLayoutPreset = (typeof UI_LAYOUT_PRESET)[LayoutPreset];

export const UI_LABELS = {
  locationType: UI_LOCATION_TYPE,
  locationStatus: UI_LOCATION_STATUS,
  role: UI_ROLE,
  orientation: { LANDSCAPE: "Landscape", PORTRAIT: "Portrait" },
  mediaType: { VIDEO: "Video", IMAGE: "Image", QR: "QR", LOGO: "Logo" },
  layoutPreset: UI_LAYOUT_PRESET,
  playlistStatus: {
    DRAFT: "Draft",
    ACTIVE: "Active",
    SCHEDULED: "Scheduled",
    ARCHIVED: "Archived",
  },
  campaignStatus: {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    PUBLISHING: "Publishing",
    ACTIVE: "Active",
    PAUSED: "Paused",
    EXPIRED: "Ended",
    ARCHIVED: "Archived",
  },
  transition: {
    CUT: "Cut",
    FADE: "Fade",
    SLIDE: "Slide",
    SLIDE_RIGHT: "Slide right",
    SLIDE_UP: "Slide up",
    SLIDE_DOWN: "Slide down",
    ZOOM: "Zoom",
    WIPE: "Wipe",
    DISSOLVE: "Dissolve",
    NONE: "None",
  },
  fitMode: { FIT: "Fit", FILL: "Fill", COVER: "Cover", CONTAIN: "Contain", STRETCH: "Stretch" },
  zoneType: {
    VIDEO: "Video",
    IMAGE: "Image",
    SLIDESHOW: "Slideshow",
    TEXT: "Text",
    QR: "QR",
    LOGO: "Logo",
    CLOCK: "Time",
    DATE: "Date",
  },
  syncState: {
    WAITING: "Waiting",
    NOTIFIED: "Notified",
    DOWNLOADING: "Downloading",
    VERIFYING: "Verifying",
    READY: "Ready",
    ACTIVE: "Active",
    FAILED: "Failed",
    OFFLINE: "Offline",
  },
  day: { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" },
} as const;

export function invert<K extends string, V extends string>(record: Record<K, V>): Record<V, K> {
  const out = {} as Record<V, K>;
  for (const key of Object.keys(record) as K[]) {
    out[record[key]] = key;
  }
  return out;
}
