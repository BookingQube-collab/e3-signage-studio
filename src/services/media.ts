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
  mediaStorageBackendFn,
  moveMediaBulkFn,
  moveMediaToFolderFn,
  renameMediaFn,
  resyncMediaFromStorageFn,
  archiveMediaFn,
} from "@/lib/media-functions";
import { assertUploadSize, inferMediaMime } from "@/lib/media-file";
import { describeBrowserUploadFailure, describeCanceledStatement, describeResyncError } from "@/lib/media-upload-error";
import {
  buildOptimisticLibraryMedia,
  clientUploadDedupeKey,
  COMPLETE_UPLOAD_CLIENT_TIMEOUT_MS,
  settleEachUpload,
} from "@/lib/media-upload-lifecycle";
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
    // Send the File directly — do not copy into a new Blob (doubles memory for large videos).
    xhr.send(file);
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function localMediaPreview(file: File): string | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return undefined;
  // Images only — blob URLs for large videos hang the library grid while uploading.
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) {
    return URL.createObjectURL(file);
  }
  return undefined;
}

async function uploadOne(
  file: File,
  mediaId: string | null,
  onProgress?: (percent: number, ready?: Media) => void,
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
      versionNumber?: number;
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
      await putWithProgress(intent.uploadUrl, intent.uploadMethod, file, intent.uploadHeaders, (percent) => {
        if (percent >= 100) return;
        onProgress?.(percent);
      });
    } catch (error) {
      if (intent && !mediaId) await discardIntent(intent);
      throw error;
    }
    if (!intent) throw new Error("Upload session not found.");
    const optimistic = buildOptimisticLibraryMedia({
      id: intent.mediaId,
      filename: file.name,
      mimeType: mime,
      sizeBytes: file.size,
      folderId: mediaId ? null : (folderId ?? null),
      folderName: null,
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationMs,
      checksumSha256,
      thumbnailUrl: localMediaPreview(file),
      versionNumber: intent.versionNumber,
    });
    onProgress?.(100, mediaId ? undefined : optimistic);
    try {
      const confirmed = await withTimeout(
        completeAfterPut(intent, checksumSha256),
        COMPLETE_UPLOAD_CLIENT_TIMEOUT_MS,
        "Could not finish uploading this file. Try that file again.",
      );
      if (!mediaId) onProgress?.(100, confirmed);
      return confirmed;
    } catch (error) {
      if (!mediaId) return optimistic;
      throw error;
    }
  })();

  inFlightUploads.set(key, run);
  try {
    return await run;
  } finally {
    inFlightUploads.delete(key);
  }
}

async function completeAfterPut(
  intent: { mediaVersionId: string },
  checksumSha256: string,
): Promise<Media> {
  try {
    const row = await completeMediaUploadFn({
      data: {
        accessToken: await accessToken(),
        mediaVersionId: intent.mediaVersionId,
        checksumSha256,
      },
    });
    return toUiMedia(row);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const row = await completeMediaUploadFn({
      data: {
        accessToken: await accessToken(),
        mediaVersionId: intent.mediaVersionId,
        checksumSha256,
      },
    });
    return toUiMedia(row);
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
    const hasLargeVideo = files.some(
      (file) =>
        file.size > 25 * 1024 * 1024 &&
        (file.type.startsWith("video/") || /\.mp4$/i.test(file.name)),
    );
    const { uploaded, failed } = await settleEachUpload(
      files,
      (file) =>
        uploadOne(
          file,
          null,
          (percent, ready) => {
            onProgress?.(file.name, percent, ready);
          },
          folderId,
        ),
      (error, fileName) =>
        describeCanceledStatement(
          error instanceof Error ? error.message : "",
          `Could not finish uploading ${fileName}. The file was not added to the library. Try that file again.`,
        ),
      // One large video at a time keeps the CMS navigable during hash + PUT.
      hasLargeVideo ? 1 : 2,
    );
    return { uploaded, failed };
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
  remove: async (id, _options) =>
    deleteMediaFn({
      data: {
        accessToken: await accessToken(),
        id,
        deleteFromStorage: true,
      },
    }),
  removeMany: async (ids, _options) =>
    deleteMediaBulkFn({
      data: {
        accessToken: await accessToken(),
        ids,
        deleteFromStorage: true,
      },
    }),
  downloadUrl: async (id) => mediaDownloadUrlFn({ data: { accessToken: await accessToken(), id } }),
  resyncFromStorage: async (folderId) => {
    try {
      const result = await resyncMediaFromStorageFn({
        data: { accessToken: await accessToken(), folderId: folderId ?? null },
      });
      return {
        media: result.media.map(toUiMedia),
        purgedCount: result.purgedCount,
      };
    } catch (error) {
      throw new Error(describeResyncError(error instanceof Error ? error.message : ""));
    }
  },
  listFolders: async () => {
    const rows = await listMediaFoldersFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiFolder);
  },
  createFolder: async (name) => {
    const row = await createMediaFolderFn({ data: { accessToken: await accessToken(), name } });
    return toUiFolder(row);
  },
  deleteFolder: async (id, _options) => {
    try {
      return await deleteMediaFolderFn({
        data: {
          accessToken: await accessToken(),
          id,
          deleteFromStorage: true,
        },
      });
    } catch (error) {
      throw new Error(
        describeCanceledStatement(
          error instanceof Error ? error.message : "",
          "Could not finish deleting this folder. It is still in the library. Try again, or remove files from live playlists first.",
        ),
      );
    }
  },
  storageBackend: async () => {
    try {
      return await mediaStorageBackendFn({ data: { accessToken: await accessToken() } });
    } catch {
      return "r2";
    }
  },
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
