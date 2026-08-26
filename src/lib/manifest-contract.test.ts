import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { isoDateTimeSchema, sha256Schema, uuidSchema } from "../../packages/validation/src/index.ts";
import { FIT_MODES, MEDIA_TYPES, TRANSITIONS, ZONE_CONTENT_TYPES } from "../../packages/shared-types/src/enums.ts";

function enumOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]]);
}

const manifestAssetSchema = z.object({
  id: uuidSchema,
  version: z.number().int().positive(),
  type: enumOf(MEDIA_TYPES),
  checksum: sha256Schema,
  fileSize: z.number().int().min(0),
  localFilename: z.string().min(1).max(255),
  mimeType: z.string(),
  downloadUrl: z.string().url(),
});

const contentManifestSchema = z.object({
  screenId: uuidSchema,
  manifestVersion: z.number().int().positive(),
  configVersion: z.number().int().min(0),
  generatedAt: isoDateTimeSchema,
  playlist: z
    .object({
      id: uuidSchema,
      version: z.number().int().positive(),
      loop: z.boolean(),
      items: z.array(
        z.object({
          mediaId: uuidSchema,
          mediaVersionId: uuidSchema,
          durationSeconds: z.number().positive(),
          transition: enumOf(TRANSITIONS),
          localFilename: z.string(),
        }),
      ),
    })
    .nullable(),
  layouts: z.array(
    z.object({
      id: uuidSchema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      background: z.string(),
      zones: z.array(
        z.object({
          id: z.string(),
          type: enumOf(ZONE_CONTENT_TYPES),
          x: z.number().int().min(0),
          y: z.number().int().min(0),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          fit: enumOf(FIT_MODES).default("CONTAIN"),
          contentRef: z.string().nullable(),
        }),
      ),
    }),
  ),
  schedules: z.array(z.unknown()),
  assets: z.array(manifestAssetSchema),
});

const deviceSyncStatusResponseSchema = z.object({
  manifestVersion: z.number().int().min(0),
  configVersion: z.number().int().min(0),
  syncRequested: z.boolean(),
});

const uuid = "11111111-1111-4111-8111-111111111111";
const checksum = "a".repeat(64);

test("accepts a mixed playlist plus split-layout manifest", () => {
  const parsed = contentManifestSchema.parse({
    screenId: uuid,
    manifestVersion: 22,
    configVersion: 1,
    generatedAt: "2026-08-26T12:00:00.000Z",
    playlist: {
      id: uuid,
      version: 3,
      loop: true,
      items: [
        {
          mediaId: uuid,
          mediaVersionId: uuid,
          durationSeconds: 12,
          transition: "CUT",
          localFilename: "clip_v3.mp4",
        },
      ],
    },
    layouts: [
      {
        id: uuid,
        width: 1920,
        height: 1080,
        background: "#19161A",
        zones: [
          {
            id: "video",
            type: "VIDEO",
            x: 0,
            y: 0,
            width: 1344,
            height: 1080,
            fit: "COVER",
            contentRef: null,
          },
          {
            id: "side",
            type: "IMAGE",
            x: 1344,
            y: 0,
            width: 576,
            height: 1080,
            fit: "CONTAIN",
            contentRef: "side.png",
          },
        ],
      },
    ],
    schedules: [],
    assets: [
      {
        id: uuid,
        version: 3,
        type: "VIDEO",
        checksum,
        fileSize: 500_000_000,
        localFilename: "clip_v3.mp4",
        mimeType: "video/mp4",
        downloadUrl: "https://signed.example/clip_v3.mp4",
      },
    ],
  });
  assert.equal(parsed.layouts[0]?.zones.length, 2);
  assert.equal(parsed.playlist?.items.length, 1);
});

test("rejects a manifest asset without a SHA-256 checksum", () => {
  const result = contentManifestSchema.safeParse({
    screenId: uuid,
    manifestVersion: 1,
    configVersion: 1,
    generatedAt: "2026-08-26T12:00:00.000Z",
    playlist: null,
    layouts: [],
    schedules: [],
    assets: [
      {
        id: uuid,
        version: 1,
        type: "IMAGE",
        checksum: "not-a-hash",
        fileSize: 10,
        localFilename: "a.jpg",
        mimeType: "image/jpeg",
        downloadUrl: "https://signed.example/a.jpg",
      },
    ],
  });
  assert.equal(result.success, false);
});

test("sync-status does not imply a full manifest fetch", () => {
  const status = deviceSyncStatusResponseSchema.parse({
    manifestVersion: 21,
    configVersion: 1,
    syncRequested: false,
  });
  assert.equal(status.syncRequested, false);
  assert.equal(status.manifestVersion, 21);
});
