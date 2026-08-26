import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { mediaMimeSchema, sha256Schema } from "@e3/validation";

import type { MediaRecord } from "@/services/media-map";

const accessTokenSchema = z.object({ accessToken: z.string() });

export const listMediaFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<MediaRecord[]> => {
    const { listMedia } = await import("@/server/media.server");
    return listMedia(data.accessToken);
  });

export const getMediaFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<MediaRecord | null> => {
    const { getMedia } = await import("@/server/media.server");
    return getMedia(data.accessToken, data.id);
  });

export const createMediaUploadIntentFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      filename: z.string().min(1).max(255),
      mimeType: mediaMimeSchema,
      sizeBytes: z.number().int().positive().max(8_000_000_000),
      checksumSha256: sha256Schema,
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      durationMs: z.number().int().positive().nullable(),
      mediaId: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { createUploadIntent } = await import("@/server/media.server");
    const { accessToken, ...input } = data;
    return createUploadIntent(accessToken, input);
  });

export const completeMediaUploadFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      mediaVersionId: z.string().uuid(),
      checksumSha256: sha256Schema,
    }),
  )
  .handler(async ({ data }): Promise<MediaRecord> => {
    const { completeUpload } = await import("@/server/media.server");
    return completeUpload(data.accessToken, {
      mediaVersionId: data.mediaVersionId,
      checksumSha256: data.checksumSha256,
    });
  });

export const renameMediaFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      id: z.string().uuid(),
      filename: z.string().trim().min(1).max(255),
    }),
  )
  .handler(async ({ data }): Promise<MediaRecord> => {
    const { renameMedia } = await import("@/server/media.server");
    return renameMedia(data.accessToken, data.id, data.filename);
  });

export const archiveMediaFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<MediaRecord> => {
    const { archiveMedia } = await import("@/server/media.server");
    return archiveMedia(data.accessToken, data.id);
  });

export const deleteMediaFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<boolean> => {
    const { deleteMedia } = await import("@/server/media.server");
    return deleteMedia(data.accessToken, data.id);
  });

export const mediaDownloadUrlFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ url: string; filename: string }> => {
    const { mediaDownloadUrl } = await import("@/server/media.server");
    return mediaDownloadUrl(data.accessToken, data.id);
  });
