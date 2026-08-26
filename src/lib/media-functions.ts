import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { HARD_MAX_UPLOAD_BYTES, mediaMimeSchema, sha256Schema } from "@e3/validation";

import type { MediaFolderRecord, MediaRecord } from "@/services/media-map";

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
      sizeBytes: z.number().int().positive().max(HARD_MAX_UPLOAD_BYTES),
      checksumSha256: sha256Schema,
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      durationMs: z.number().int().positive().nullable(),
      mediaId: z.string().uuid().nullable(),
      folderId: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { createUploadIntent } = await import("@/server/media.server");
    const { accessToken, ...input } = data;
    return createUploadIntent(accessToken, {
      ...input,
      folderId: input.folderId ?? null,
    });
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

export const discardIncompleteMediaFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      mediaId: z.string().uuid(),
      mediaVersionId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }): Promise<boolean> => {
    const { discardIncompleteUpload } = await import("@/server/media.server");
    return discardIncompleteUpload(data.accessToken, {
      mediaId: data.mediaId,
      mediaVersionId: data.mediaVersionId,
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

export const deleteMediaBulkFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      ids: z.array(z.string().uuid()).min(1).max(100),
    }),
  )
  .handler(async ({ data }): Promise<boolean> => {
    const { deleteMediaBulk } = await import("@/server/media.server");
    return deleteMediaBulk(data.accessToken, data.ids);
  });

export const mediaDownloadUrlFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ url: string; filename: string }> => {
    const { mediaDownloadUrl } = await import("@/server/media.server");
    return mediaDownloadUrl(data.accessToken, data.id);
  });

export const listMediaFoldersFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<MediaFolderRecord[]> => {
    const { listFolders } = await import("@/server/media.server");
    return listFolders(data.accessToken);
  });

export const createMediaFolderFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ name: z.string().min(1).max(80) }))
  .handler(async ({ data }): Promise<MediaFolderRecord> => {
    const { createFolder } = await import("@/server/media.server");
    return createFolder(data.accessToken, data.name);
  });

export const deleteMediaFolderFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<boolean> => {
    const { deleteFolder } = await import("@/server/media.server");
    return deleteFolder(data.accessToken, data.id);
  });

export const moveMediaToFolderFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      id: z.string().uuid(),
      folderId: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ data }): Promise<MediaRecord> => {
    const { moveMediaToFolder } = await import("@/server/media.server");
    return moveMediaToFolder(data.accessToken, data.id, data.folderId);
  });

export const moveMediaBulkFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      ids: z.array(z.string().uuid()).min(1).max(100),
      folderId: z.string().uuid().nullable(),
    }),
  )
  .handler(async ({ data }): Promise<MediaRecord[]> => {
    const { moveMediaBulk } = await import("@/server/media.server");
    return moveMediaBulk(data.accessToken, data.ids, data.folderId);
  });
