import { z } from "zod";
import {
  CONTENT_PACKAGE_STATES,
  FIT_MODES,
  MEDIA_TYPES,
  TRANSITIONS,
  WAITING_SCREEN_BRANDS,
  ZONE_CONTENT_TYPES,
} from "../../shared-types/src/enums";
import {
  idempotencyKeySchema,
  isoDateTimeSchema,
  pairingCodeSchema,
  percentSchema,
  sha256Schema,
  uuidSchema,
} from "../../validation/src/index";
import { deviceSyncStateSchema, orientationSchema, screenOperationalStatusSchema } from "./admin";

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]]);
}

export const devicePairRequestSchema = z.object({
  appVersion: z.string().min(1).max(40),
  deviceName: z.string().min(1).max(120).optional(),
  orientation: orientationSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const devicePairResponseSchema = z.object({
  code: z.string().length(6),
  expiresAt: isoDateTimeSchema,
  pollAfterMs: z.number().int().positive(),
});

export const deviceActivateRequestSchema = z.object({
  code: pairingCodeSchema,
});

export const deviceActivateResponseSchema = z.object({
  status: z.enum(["PENDING", "ACTIVATED", "EXPIRED", "INVALID"]),
  deviceToken: z.string().optional(),
  deviceId: uuidSchema.optional(),
  screenId: uuidSchema.optional(),
});

export const waitingScreenBrandSchema = enumOf(WAITING_SCREEN_BRANDS);

/** Optional downloadable image asset nested under waiting-screen / branding sync. */
export const deviceBrandAssetSchema = z.object({
  mediaId: uuidSchema,
  version: z.number().int().positive(),
  checksum: sha256Schema,
  fileSize: z.number().int().min(0),
  mimeType: z.string(),
  downloadUrl: z.string().url(),
});

export const deviceWaitingScreenSchema = z.object({
  brand: waitingScreenBrandSchema,
  mediaId: uuidSchema.nullable(),
  version: z.number().int().positive().nullable(),
  checksum: sha256Schema.nullable(),
  fileSize: z.number().int().min(0).nullable(),
  mimeType: z.string().nullable(),
  downloadUrl: z.string().url().nullable(),
  title: z.string().max(120).nullable(),
  message: z.string().max(500).nullable(),
  configVersion: z.number().int().min(0),
  /**
   * Admin-managed in-app brand icon (waiting / idle). Synced at runtime.
   * This is NOT the Android launcher/home-screen icon — that requires an APK rebuild.
   */
  brandIcon: deviceBrandAssetSchema.nullable().optional(),
});

export const deviceSyncStatusResponseSchema = z.object({
  manifestVersion: z.number().int().min(0),
  configVersion: z.number().int().min(0),
  syncRequested: z.boolean(),
  rotatedToken: z.string().min(16).optional(),
  waitingScreen: deviceWaitingScreenSchema.optional(),
});

export const manifestAssetSchema = z.object({
  id: uuidSchema,
  version: z.number().int().positive(),
  type: enumOf(MEDIA_TYPES),
  checksum: sha256Schema,
  fileSize: z.number().int().min(0),
  localFilename: z.string().min(1).max(255),
  mimeType: z.string(),
  downloadUrl: z.string().url(),
});

export const manifestZoneSchema = z.object({
  id: z.string(),
  type: enumOf(ZONE_CONTENT_TYPES),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: enumOf(FIT_MODES).default("CONTAIN"),
  contentRef: z.string().nullable(),
});

export const manifestLayoutSchema = z.object({
  id: uuidSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: z.string(),
  zones: z.array(manifestZoneSchema),
});

export const manifestPlaylistItemSchema = z.object({
  mediaId: uuidSchema,
  mediaVersionId: uuidSchema,
  durationSeconds: z.number().positive(),
  transition: enumOf(TRANSITIONS),
  localFilename: z.string(),
});

export const manifestPlaylistSchema = z.object({
  id: uuidSchema,
  version: z.number().int().positive(),
  loop: z.boolean(),
  items: z.array(manifestPlaylistItemSchema),
});

export const manifestScheduleSchema = z.object({
  campaignId: uuidSchema,
  startAt: isoDateTimeSchema.nullable(),
  endAt: isoDateTimeSchema.nullable(),
  startTime: z.string(),
  endTime: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  timezone: z.string(),
  priority: z.number().int().min(0).max(100),
  emergency: z.boolean(),
});

export const contentManifestSchema = z.object({
  screenId: uuidSchema,
  manifestVersion: z.number().int().positive(),
  configVersion: z.number().int().min(0),
  generatedAt: isoDateTimeSchema,
  playlist: manifestPlaylistSchema.nullable(),
  layouts: z.array(manifestLayoutSchema),
  schedules: z.array(manifestScheduleSchema),
  assets: z.array(manifestAssetSchema),
});

export const deviceHeartbeatRequestSchema = z.object({
  screenId: uuidSchema,
  appVersion: z.string().min(1).max(40),
  uptimeSeconds: z.number().int().min(0),
  activeManifestVersion: z.number().int().min(0).nullable().optional(),
  activePlaylistId: uuidSchema.nullable().optional(),
  currentlyPlayingMediaId: uuidSchema.nullable().optional(),
  totalStorageBytes: z.number().int().min(0),
  availableStorageBytes: z.number().int().min(0),
  networkOnline: z.boolean(),
  lastSuccessfulSyncAt: isoDateTimeSchema.nullable().optional(),
  lastError: z.string().max(2000).nullable().optional(),
  operationalStatus: screenOperationalStatusSchema,
  syncState: deviceSyncStateSchema,
  syncProgress: percentSchema,
});

export const deviceSyncConfirmationSchema = z.object({
  manifestVersion: z.number().int().positive(),
  packageState: enumOf(CONTENT_PACKAGE_STATES),
  failedAssetId: uuidSchema.optional(),
  error: z.string().max(2000).optional(),
});

export const playbackLogEventSchema = z.object({
  clientEventId: uuidSchema,
  campaignId: uuidSchema.nullable().optional(),
  playlistId: uuidSchema.nullable().optional(),
  mediaId: uuidSchema,
  mediaVersionId: uuidSchema.nullable().optional(),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable().optional(),
  durationMs: z.number().int().min(0),
  result: z.enum(["COMPLETED", "SKIPPED", "ERROR", "INTERRUPTED"]),
});

export const playbackLogBatchSchema = z.object({
  batchId: idempotencyKeySchema,
  screenId: uuidSchema,
  events: z.array(playbackLogEventSchema).min(1).max(500),
});

export const errorLogEventSchema = z.object({
  clientEventId: uuidSchema,
  at: isoDateTimeSchema,
  code: z.string().min(1).max(80),
  message: z.string().max(2000),
  mediaId: uuidSchema.nullable().optional(),
  manifestVersion: z.number().int().optional(),
});

export const errorLogBatchSchema = z.object({
  batchId: idempotencyKeySchema,
  screenId: uuidSchema,
  events: z.array(errorLogEventSchema).min(1).max(200),
});

export const deviceOkResponseSchema = z.object({
  ok: z.literal(true),
  rotatedToken: z.string().min(16).optional(),
});
export type DevicePairRequest = z.infer<typeof devicePairRequestSchema>;
export type DevicePairResponse = z.infer<typeof devicePairResponseSchema>;
export type DeviceActivateResponse = z.infer<typeof deviceActivateResponseSchema>;
export type DeviceSyncStatusResponse = z.infer<typeof deviceSyncStatusResponseSchema>;
export type DeviceWaitingScreen = z.infer<typeof deviceWaitingScreenSchema>;
export type DeviceBrandAsset = z.infer<typeof deviceBrandAssetSchema>;
export type DeviceOkResponse = z.infer<typeof deviceOkResponseSchema>;
export type ContentManifest = z.infer<typeof contentManifestSchema>;
export type DeviceHeartbeatRequest = z.infer<typeof deviceHeartbeatRequestSchema>;
export type PlaybackLogBatch = z.infer<typeof playbackLogBatchSchema>;
export type ErrorLogBatch = z.infer<typeof errorLogBatchSchema>;
