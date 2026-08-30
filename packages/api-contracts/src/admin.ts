import { z } from "zod";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TARGET_TYPES,
  CONNECTIVITY_STATUSES,
  DEVICE_SYNC_STATES,
  FIT_MODES,
  LAYOUT_PRESETS,
  LOCATION_STATUSES,
  LOCATION_TYPES,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  ORIENTATIONS,
  PLAYLIST_STATUSES,
  SCREEN_OPERATIONAL_STATUSES,
  TRANSITIONS,
  USER_ROLES,
  USER_STATUSES,
  ZONE_CONTENT_TYPES,
} from "../../shared-types/src/enums";
import {
  isoDateSchema,
  isoDateTimeSchema,
  mediaMimeSchema,
  nonEmptyNameSchema,
  percentSchema,
  sha256Schema,
  timeOfDaySchema,
  timezoneSchema,
  uuidSchema,
} from "../../validation/src/index";

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]]);
}

export const locationTypeSchema = enumOf(LOCATION_TYPES);
export const locationStatusSchema = enumOf(LOCATION_STATUSES);
export const userRoleSchema = enumOf(USER_ROLES);
export const userStatusSchema = enumOf(USER_STATUSES);
export const orientationSchema = enumOf(ORIENTATIONS);
export const screenOperationalStatusSchema = enumOf(SCREEN_OPERATIONAL_STATUSES);
export const connectivityStatusSchema = enumOf(CONNECTIVITY_STATUSES);
export const deviceSyncStateSchema = enumOf(DEVICE_SYNC_STATES);
export const mediaTypeSchema = enumOf(MEDIA_TYPES);
export const mediaStatusSchema = enumOf(MEDIA_STATUSES);
export const playlistStatusSchema = enumOf(PLAYLIST_STATUSES);
export const transitionSchema = enumOf(TRANSITIONS);
export const zoneContentTypeSchema = enumOf(ZONE_CONTENT_TYPES);
export const fitModeSchema = enumOf(FIT_MODES);
export const layoutPresetSchema = enumOf(LAYOUT_PRESETS);
export const campaignStatusSchema = enumOf(CAMPAIGN_STATUSES);
export const campaignTargetTypeSchema = enumOf(CAMPAIGN_TARGET_TYPES);

export const locationDtoSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: nonEmptyNameSchema,
  shortName: z.string().min(1).max(80),
  code: z.string().min(1).max(40),
  type: locationTypeSchema,
  status: locationStatusSchema,
  description: z.string().max(4000).nullable(),
  timezone: timezoneSchema,
  city: z.string().max(120).nullable(),
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema.nullable(),
  screenCount: z.number().int().min(0),
  onlineCount: z.number().int().min(0),
  activeCampaigns: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const locationCreateSchema = z.object({
  name: nonEmptyNameSchema,
  shortName: z.string().min(1).max(80).optional(),
  code: z.string().min(1).max(40).optional(),
  type: locationTypeSchema,
  status: locationStatusSchema.default("ACTIVE"),
  description: z.string().max(4000).optional(),
  timezone: timezoneSchema.default("Asia/Qatar"),
  city: z.string().max(120).optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
});

export const locationUpdateSchema = locationCreateSchema.partial();

export const screenDtoSchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  locationName: z.string(),
  name: nonEmptyNameSchema,
  deviceId: uuidSchema.nullable(),
  deviceName: z.string().nullable(),
  screenType: z.string().min(1).max(80),
  orientation: orientationSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  groupIds: z.array(uuidSchema),
  connectivity: connectivityStatusSchema,
  operationalStatus: screenOperationalStatusSchema,
  syncState: deviceSyncStateSchema,
  syncProgress: percentSchema,
  playlistId: uuidSchema.nullable(),
  playlistName: z.string().nullable(),
  currentlyPlayingMediaId: uuidSchema.nullable(),
  currentlyPlayingName: z.string().nullable(),
  localManifestVersion: z.number().int().min(0).nullable(),
  cloudManifestVersion: z.number().int().min(0).nullable(),
  localConfigVersion: z.number().int().min(0).nullable(),
  cloudConfigVersion: z.number().int().min(0).nullable(),
  lastHeartbeatAt: isoDateTimeSchema.nullable(),
  lastSyncAt: isoDateTimeSchema.nullable(),
  totalStorageBytes: z.number().int().min(0).nullable(),
  availableStorageBytes: z.number().int().min(0).nullable(),
  appVersion: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const screenPairAdminSchema = z.object({
  code: z.string().min(6).max(12),
  name: nonEmptyNameSchema,
  locationId: uuidSchema,
  screenType: z.string().min(1).max(80),
  orientation: orientationSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  groupIds: z.array(uuidSchema).default([]),
});

export const screenGroupDtoSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: nonEmptyNameSchema,
  description: z.string().max(1000).nullable(),
  screenIds: z.array(uuidSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const mediaVersionDtoSchema = z.object({
  id: uuidSchema,
  mediaId: uuidSchema,
  versionNumber: z.number().int().positive(),
  mimeType: z.string(),
  sizeBytes: z.number().int().min(0),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().min(0).nullable(),
  checksumSha256: sha256Schema,
  storageKey: z.string(),
  thumbnailKey: z.string().nullable(),
  status: mediaStatusSchema,
  createdAt: isoDateTimeSchema,
});

export const mediaDtoSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: nonEmptyNameSchema,
  type: mediaTypeSchema,
  mimeType: z.string(),
  status: mediaStatusSchema,
  currentVersion: mediaVersionDtoSchema.nullable(),
  usedIn: z.object({
    playlists: z.array(z.string()),
    campaigns: z.array(z.string()),
    screens: z.array(z.string()),
  }),
  uploadedBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const mediaUploadIntentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: mediaMimeSchema,
  sizeBytes: z.number().int().positive().max(8_000_000_000),
  checksumSha256: sha256Schema,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().positive().nullable(),
  mediaId: uuidSchema.nullable(),
});

export const mediaUploadIntentResponseSchema = z.object({
  mediaId: uuidSchema,
  mediaVersionId: uuidSchema,
  versionNumber: z.number().int().positive(),
  storageKey: z.string().min(1),
  uploadUrl: z.string().min(1),
  uploadMethod: z.enum(["PUT", "POST"]),
  uploadHeaders: z.record(z.string()),
  expiresInSeconds: z.number().int().positive(),
});

export const mediaCompleteSchema = z.object({
  mediaVersionId: uuidSchema,
  checksumSha256: sha256Schema,
});

export const playlistItemDtoSchema = z.object({
  id: uuidSchema,
  playlistId: uuidSchema,
  mediaId: uuidSchema,
  mediaVersionId: uuidSchema,
  filename: z.string(),
  type: mediaTypeSchema,
  position: z.number().int().min(0),
  durationSeconds: z.number().positive(),
  transition: transitionSchema,
  layoutId: uuidSchema.nullable(),
  priority: z.number().int().min(0).max(100),
});

export const playlistDtoSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: nonEmptyNameSchema,
  status: playlistStatusSchema,
  items: z.array(playlistItemDtoSchema),
  usedByScreens: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const layoutZoneDtoSchema = z.object({
  id: uuidSchema,
  layoutId: uuidSchema,
  name: z.string().min(1).max(80),
  type: zoneContentTypeSchema,
  xPercent: percentSchema,
  yPercent: percentSchema,
  widthPercent: percentSchema,
  heightPercent: percentSchema,
  contentRef: z.string().nullable(),
  fit: fitModeSchema,
  background: z.string().max(32),
  durationSeconds: z.number().min(0),
});

export const layoutDtoSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: nonEmptyNameSchema,
  preset: layoutPresetSchema,
  orientation: orientationSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  background: z.string().max(32),
  zones: z.array(layoutZoneDtoSchema),
  usedByScreens: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const scheduleDtoSchema = z.object({
  id: uuidSchema,
  campaignId: uuidSchema,
  startDate: isoDateSchema.nullable(),
  endDate: isoDateSchema.nullable(),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  timezone: timezoneSchema,
  priority: z.number().int().min(0).max(100),
});

export const campaignTargetDtoSchema = z.object({
  id: uuidSchema,
  campaignId: uuidSchema,
  type: campaignTargetTypeSchema,
  targetId: uuidSchema.nullable(),
});

export const campaignDtoSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: nonEmptyNameSchema,
  description: z.string().max(4000),
  status: campaignStatusSchema,
  playlistId: uuidSchema.nullable(),
  layoutId: uuidSchema.nullable(),
  contentName: z.string(),
  targets: z.array(campaignTargetDtoSchema),
  locationIds: z.array(uuidSchema),
  screenIds: z.array(uuidSchema),
  schedule: scheduleDtoSchema.nullable(),
  syncReady: z.number().int().min(0),
  syncTotal: z.number().int().min(0),
  liveScreenCount: z.number().int().min(0).default(0),
  currentlyPlayingName: z.string().nullable().default(null),
  createdBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const campaignPublishSchema = z.object({
  campaignId: uuidSchema,
  emergency: z.boolean().default(false),
});

export const syncStatusItemDtoSchema = z.object({
  screenId: uuidSchema,
  screenName: z.string(),
  locationName: z.string(),
  state: deviceSyncStateSchema,
  progress: percentSchema,
});

export const userDtoSchema = z.object({
  id: uuidSchema,
  name: nonEmptyNameSchema,
  email: z.string().email(),
  role: userRoleSchema,
  status: userStatusSchema,
  locationIds: z.array(uuidSchema),
  lastActiveAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const heartbeatDtoSchema = z.object({
  deviceId: uuidSchema,
  screenId: uuidSchema,
  appVersion: z.string(),
  uptimeSeconds: z.number().int().min(0),
  activeManifestVersion: z.number().int().min(0).nullable(),
  activePlaylistId: uuidSchema.nullable(),
  currentlyPlayingMediaId: uuidSchema.nullable(),
  totalStorageBytes: z.number().int().min(0),
  availableStorageBytes: z.number().int().min(0),
  networkOnline: z.boolean(),
  lastSuccessfulSyncAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  operationalStatus: screenOperationalStatusSchema,
  syncState: deviceSyncStateSchema,
  syncProgress: percentSchema,
  receivedAt: isoDateTimeSchema,
});

export const playbackLogDtoSchema = z.object({
  id: uuidSchema,
  screenId: uuidSchema,
  campaignId: uuidSchema.nullable(),
  playlistId: uuidSchema.nullable(),
  mediaId: uuidSchema,
  mediaVersionId: uuidSchema.nullable(),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  durationMs: z.number().int().min(0),
  result: z.enum(["COMPLETED", "SKIPPED", "ERROR", "INTERRUPTED"]),
});

export type LocationDto = z.infer<typeof locationDtoSchema>;
export type LocationCreate = z.infer<typeof locationCreateSchema>;
export type ScreenDto = z.infer<typeof screenDtoSchema>;
export type ScreenGroupDto = z.infer<typeof screenGroupDtoSchema>;
export type MediaDto = z.infer<typeof mediaDtoSchema>;
export type MediaVersionDto = z.infer<typeof mediaVersionDtoSchema>;
export type MediaUploadIntent = z.infer<typeof mediaUploadIntentSchema>;
export type MediaUploadIntentResponse = z.infer<typeof mediaUploadIntentResponseSchema>;
export type MediaComplete = z.infer<typeof mediaCompleteSchema>;
export type PlaylistDto = z.infer<typeof playlistDtoSchema>;
export type LayoutDto = z.infer<typeof layoutDtoSchema>;
export type CampaignDto = z.infer<typeof campaignDtoSchema>;
export type ScheduleDto = z.infer<typeof scheduleDtoSchema>;
export type SyncStatusItemDto = z.infer<typeof syncStatusItemDtoSchema>;
export type UserDto = z.infer<typeof userDtoSchema>;
export type HeartbeatDto = z.infer<typeof heartbeatDtoSchema>;
export type PlaybackLogDto = z.infer<typeof playbackLogDtoSchema>;
