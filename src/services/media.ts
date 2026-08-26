import {
  completeMediaUploadFn,
  createMediaFolderFn,
  createMediaUploadIntentFn,
  deleteMediaFolderFn,
  deleteMediaFn,
  getMediaFn,
  listMediaFoldersFn,
  listMediaFn,
  mediaDownloadUrlFn,
  moveMediaToFolderFn,
  renameMediaFn,
  archiveMediaFn,
} from "@/lib/media-functions";
import { assertUploadSize, inferMediaMime } from "@/lib/media-file";
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
      reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

async function uploadOne(
  file: File,
  mediaId: string | null,
  onProgress?: (percent: number) => void,
  folderId?: string | null,
): Promise<Media> {
  const mime = inferMediaMime(file.name, file.type);
  if (!mime) {
    throw new Error(`Unsupported file type: ${file.name}. Use JPEG, PNG, WebP, or MP4.`);
  }
  assertUploadSize(mime, file.size);
  onProgress?.(0);
  const [checksumSha256, probe] = await Promise.all([sha256HexOfBlob(file), probeMediaDimensions(file)]);
  const intent = await createMediaUploadIntentFn({
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
  const row = await completeMediaUploadFn({
    data: {
      accessToken: await accessToken(),
      mediaVersionId: intent.mediaVersionId,
      checksumSha256,
    },
  });
  return toUiMedia(row);
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
    const added: Media[] = [];
    for (const file of files) {
      added.push(
        await uploadOne(file, null, (percent) => {
          onProgress?.(file.name, percent);
        }, folderId),
      );
    }
    return added;
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
};

export type { MediaUploadProgress };
