import type { LocationStatus, LocationType, UserRole } from "./enums";

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

export type UiLocationType = (typeof UI_LOCATION_TYPE)[LocationType];
export type UiLocationStatus = (typeof UI_LOCATION_STATUS)[LocationStatus];
export type UiUserRole = (typeof UI_ROLE)[UserRole];

export const UI_LABELS = {
  locationType: UI_LOCATION_TYPE,
  locationStatus: UI_LOCATION_STATUS,
  role: UI_ROLE,
  orientation: { LANDSCAPE: "Landscape", PORTRAIT: "Portrait" },
  mediaType: { VIDEO: "Video", IMAGE: "Image", QR: "QR", LOGO: "Logo" },
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
    EXPIRED: "Expired",
    ARCHIVED: "Archived",
  },
  transition: { CUT: "Cut", FADE: "Fade", SLIDE: "Slide", ZOOM: "Zoom", NONE: "None" },
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
    NOTIFIED: "Waiting",
    DOWNLOADING: "Downloading",
    VERIFYING: "Verifying",
    READY: "Ready",
    ACTIVE: "Ready",
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
