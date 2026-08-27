import { toast } from "sonner";

import {
  completeMediaUploadFn,
  createMediaFolderFn,
  createMediaUploadIntentFn,
  deleteMediaBulkFn,
  deleteMediaFolderFn,
  deleteMediaFn,
  discardIncompleteMediaFn,
  getMediaFn,
  listMediaFoldersFn,
  listMediaFn,
  mediaDownloadUrlFn,
  moveMediaBulkFn,
  moveMediaToFolderFn,
  renameMediaFn,
  archiveMediaFn,
} from "@/lib/media-functions";
import { assertUploadSize, inferMediaMime } from "@/lib/media-file";
import { describeBrowserUploadFailure, describeCanceledStatement } from "@/lib/media-upload-error";
import { clientUploadDedupeKey, settleEachUpload } from "@/lib/media-upload-lifecycle";
import { probeMediaDimensions, sha256HexOfBlob } from "@/lib/media-hash";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { Media } from "@/types";
import { toUiFolder, toUiMedia } from "./media-map";
import type { MediaService, MediaUploadProgress } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

function putWithProgress(
  url: string,
  method: "PUT" | "POST",
  file: File,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.max(1, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(
        new Error(
          describeBrowserUploadFailure({
            status: xhr.status,
            url,
            responseText: xhr.responseText,
          }),
        ),
      );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          describeBrowserUploadFailure({
            status: xhr.status || 0,
            url,
            responseText: xhr.responseText,
          }),
        ),
      );
    xhr.ontimeout = () => reject(new Error("Upload timed out. Try again."));
    xhr.onabort = () => reject(new Error("Upload was interrupted. Try that file again."));
    const signedType = headers["Content-Type"] ?? headers["content-type"];
    xhr.send(signedType ? new Blob([file], { type: signedType }) : file);
  });
}

const inFlightUploads = new Map<string, Promise<Media>>();

async function discardIntent(intent: { mediaId: string; mediaVersionId: string }): Promise<void> {
  try {
    await discardIncompleteMediaFn({
      data: {
        accessToken: await accessToken(),
        mediaId: intent.mediaId,
        mediaVersionId: intent.mediaVersionId,
      },
    });
  } catch {
    // Row may already be gone; the library hides incomplete uploads either way.
  }
}

async function uploadOne(
  file: File,
  mediaId: string | null,
  onProgress?: (percent: number) => void,
  folderId?: string | null,
): Promise<Media> {
  const key = clientUploadDedupeKey({
    mediaId,
    folderId,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  });
  const existing = inFlightUploads.get(key);
  if (existing) return existing;

  const run = (async () => {
    const mime = inferMediaMime(file.name, file.type);
    if (!mime) {
      throw new Error(`Unsupported file type: ${file.name}. Use JPEG, PNG, WebP, or MP4.`);
    }
    assertUploadSize(mime, file.size);
    onProgress?.(0);
    const [checksumSha256, probe] = await Promise.all([sha256HexOfBlob(file), probeMediaDimensions(file)]);
    let intent: {
      mediaId: string;
      mediaVersionId: string;
      uploadUrl: string;
      uploadMethod: "PUT" | "POST";
      uploadHeaders: Record<string, string>;
    } | null = null;
    try {
      intent = await createMediaUploadIntentFn({
        data: {
          accessToken: await accessToken(),
          filename: file.name,
          mimeType: mime,
          sizeBytes: file.size,
          checksumSha256,
          width: probe.width,
          height: probe.height,
          durationMs: probe.durationMs,
          mediaId,
          folderId: mediaId ? null : (folderId ?? null),
        },
      });
      await putWithProgress(intent.uploadUrl, intent.uploadMethod, file, intent.uploadHeaders, onProgress);
    } catch (error) {
      if (intent && !mediaId) await discardIntent(intent);
      throw error;
    }
    if (!intent) throw new Error("Upload session not found.");
    const row = await completeMediaUploadFn({
      data: {
        accessToken: await accessToken(),
        mediaVersionId: intent.mediaVersionId,
        checksumSha256,
      },
    });
    return toUiMedia(row);
  })();

  inFlightUploads.set(key, run);
  try {
    return await run;
  } finally {
    inFlightUploads.delete(key);
  }
}

export const liveMediaService: MediaService = {
  list: async () => {
    const rows = await listMediaFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiMedia);
  },
  get: async (id) => {
    const row = await getMediaFn({ data: { accessToken: await accessToken(), id } });
    return row ? toUiMedia(row) : null;
  },
  upload: async (files, onProgress, folderId) => {
    const { uploaded, failed } = await settleEachUpload(
      files,
      (file) =>
        uploadOne(
          file,
          null,
          (percent) => {
            onProgress?.(file.name, percent);
          },
          folderId,
        ),
      (error, fileName) =>
        describeCanceledStatement(
          error instanceof Error ? error.message : "",
          `Could not finish uploading ${fileName}. The file was not added to the library. Try that file again.`,
        ),
    );
    if (uploaded.length === 0 && failed.length > 0) {
      throw new Error(failed[0]?.message ?? "Upload failed.");
    }
    for (const item of failed) toast.error(item.message);
    return uploaded;
  },
  replace: async (id, file, onProgress) => uploadOne(file, id, onProgress),
  rename: async (id, filename) => {
    const row = await renameMediaFn({
      data: { accessToken: await accessToken(), id, filename },
    });
    return toUiMedia(row);
  },
  archive: async (id) => {
    const row = await archiveMediaFn({ data: { accessToken: await accessToken(), id } });
    return toUiMedia(row);
  },
  remove: async (id) => deleteMediaFn({ data: { accessToken: await accessToken(), id } }),
  removeMany: async (ids) =>
    deleteMediaBulkFn({ data: { accessToken: await accessToken(), ids } }),
  downloadUrl: async (id) => mediaDownloadUrlFn({ data: { accessToken: await accessToken(), id } }),
  listFolders: async () => {
    const rows = await listMediaFoldersFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiFolder);
  },
  createFolder: async (name) => {
    const row = await createMediaFolderFn({ data: { accessToken: await accessToken(), name } });
    return toUiFolder(row);
  },
  deleteFolder: async (id) =>
    deleteMediaFolderFn({ data: { accessToken: await accessToken(), id } }),
  moveToFolder: async (id, folderId) => {
    const row = await moveMediaToFolderFn({
      data: { accessToken: await accessToken(), id, folderId },
    });
    return toUiMedia(row);
  },
  moveManyToFolder: async (ids, folderId) => {
    const rows = await moveMediaBulkFn({
      data: { accessToken: await accessToken(), ids, folderId },
    });
    return rows.map(toUiMedia);
  },
};

export type { MediaUploadProgress };
