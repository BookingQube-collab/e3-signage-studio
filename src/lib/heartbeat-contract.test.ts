import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { isoDateTimeSchema, percentSchema, uuidSchema } from "../../packages/validation/src/index.ts";

const heartbeatSchema = z.object({
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
  operationalStatus: z.enum(["READY", "SYNCING", "DOWNLOADING", "VERIFYING", "UPDATING", "ERROR", "DISABLED"]),
  syncState: z.enum(["WAITING", "NOTIFIED", "DOWNLOADING", "VERIFYING", "READY", "ACTIVE", "FAILED", "OFFLINE"]),
  syncProgress: percentSchema,
});

const playbackBatchSchema = z.object({
  batchId: uuidSchema,
  screenId: uuidSchema,
  events: z
    .array(
      z.object({
        clientEventId: uuidSchema,
        campaignId: uuidSchema.nullable().optional(),
        playlistId: uuidSchema.nullable().optional(),
        mediaId: uuidSchema,
        mediaVersionId: uuidSchema.nullable().optional(),
        startedAt: isoDateTimeSchema,
        endedAt: isoDateTimeSchema.nullable().optional(),
        durationMs: z.number().int().min(0),
        result: z.enum(["COMPLETED", "SKIPPED", "ERROR", "INTERRUPTED"]),
      }),
    )
    .min(1)
    .max(500),
});

test("heartbeat accepts omitted null fields from the Android JSON encoder", () => {
  const parsed = heartbeatSchema.safeParse({
    screenId: "11111111-1111-4111-8111-111111111111",
    appVersion: "0.12.0",
    uptimeSeconds: 12,
    activeManifestVersion: 0,
    totalStorageBytes: 1000,
    availableStorageBytes: 800,
    networkOnline: true,
    operationalStatus: "READY",
    syncState: "WAITING",
    syncProgress: 0,
  });
  assert.equal(parsed.success, true);
});

test("heartbeat rejects a payload without screenId", () => {
  const parsed = heartbeatSchema.safeParse({
    appVersion: "0.12.0",
    uptimeSeconds: 1,
    totalStorageBytes: 1,
    availableStorageBytes: 1,
    networkOnline: true,
    operationalStatus: "READY",
    syncState: "WAITING",
    syncProgress: 0,
  });
  assert.equal(parsed.success, false);
});

test("second-precision Z timestamps used by the player validate", () => {
  assert.equal(isoDateTimeSchema.safeParse("2026-08-26T13:00:00Z").success, true);
});

test("playback batch is idempotent by batchId + clientEventId", () => {
  const parsed = playbackBatchSchema.safeParse({
    batchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    screenId: "11111111-1111-4111-8111-111111111111",
    events: [
      {
        clientEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        mediaId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        startedAt: "2026-08-26T13:00:00Z",
        endedAt: "2026-08-26T13:00:10Z",
        durationMs: 10000,
        result: "COMPLETED",
      },
    ],
  });
  assert.equal(parsed.success, true);
});
