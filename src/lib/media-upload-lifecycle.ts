import { hueFromChecksum } from "./media-file.ts";

/** Rules for pending uploads: show in the library as soon as PUT succeeds; confirm in the background. */

export const COMPLETE_OBJECT_STAT_TIMEOUT_MS = 800;
export const STORAGE_LIST_TIMEOUT_MS = 4000;
export const COMPLETE_UPLOAD_CLIENT_TIMEOUT_MS = 5000;
export const AUTO_SYNC_DEADLINE_MS = 2500;
export const AUTO_SYNC_R2_MAX_PAGES = 1;
export const RESYNC_R2_PAGE_SIZE = 100;
export const RESYNC_R2_MAX_PAGES = 8;
export const RESYNC_MANUAL_DEADLINE_MS = 6500;
export const RESYNC_UPDATE_BATCH_SIZE = 8;
export const RESYNC_KEY_IN_CHUNK = 80;

export function chunkItems<T>(items: T[], size: number): T[][] {
  const chunkSize = Math.max(1, Math.floor(size));
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

export function shouldSkipLibraryAutoSync(pendingExists: boolean): boolean {
  return !pendingExists;
}

/** Manual Sync from Cloudflare must still scan R2 when nothing is PROCESSING. */
export function shouldSkipManualStorageResync(): boolean {
  return false;
}

/**
 * Manual sync should list the bucket first. HEAD-before-list burns the deadline
 * and leaves PROCESSING videos (including renamed ones) invisible in the library.
 */
export function shouldListBucketBeforeHeadPromote(importOrphans: boolean): boolean {
  return importOrphans;
}

/** Incomplete rows with a known media mime can be finalized once ListBucket saw the key. */
export function canPromoteIncompleteWithoutHead(input: {
  versionMimeType: string;
  storageKey: string;
  keySeenInBucket: boolean;
}): boolean {
  if (!input.keySeenInBucket) return false;
  if (!input.storageKey) return false;
  return (
    input.versionMimeType.startsWith("image/") ||
    input.versionMimeType.startsWith("video/") ||
    input.versionMimeType.startsWith("audio/")
  );
}

/** Intersect one R2 page with pending storage keys — never send the whole bucket to Postgres. */
export function storageKeysOnPage(pageKeys: string[], pendingKeys: Iterable<string>): string[] {
  const pending = pendingKeys instanceof Set ? pendingKeys : new Set(pendingKeys);
  return pageKeys.filter((key) => pending.has(key));
}

export function uploadProgressIsComplete(percent: number): boolean {
  return percent >= 100;
}

/** Client PUT already landed the bytes; do not block complete on a storage HEAD. */
export function shouldSkipCompleteObjectStat(clientPutSucceeded: boolean): boolean {
  return clientPutSucceeded;
}

/** Promote PROCESSING/FAILED rows when the object is already in the bucket. Never duplicate READY. */
export function shouldResyncPromote(status: string, objectFound: boolean): boolean {
  if (!objectFound) return false;
  return status === "PROCESSING" || status === "FAILED";
}

/** Reattach R2 objects that have no READY library row. Never duplicate a key that already lists. */
export function shouldImportOrphanStorageKey(
  key: string,
  readyOrKnownKeys: Iterable<string>,
): boolean {
  if (!key) return false;
  const known = readyOrKnownKeys instanceof Set ? readyOrKnownKeys : new Set(readyOrKnownKeys);
  return !known.has(key);
}

export function orphanStorageKeysOnPage(
  pageKeys: string[],
  readyOrKnownKeys: Iterable<string>,
): string[] {
  return pageKeys.filter((key) => shouldImportOrphanStorageKey(key, readyOrKnownKeys));
}

/** Archived or failed rows whose bytes are still in the bucket should come back as READY. */
export function shouldResyncRestoreLibraryRow(
  status: string,
  archivedAt: string | null | undefined,
  objectFound: boolean,
): boolean {
  if (!objectFound) return false;
  if (typeof archivedAt === "string" && archivedAt.length > 0) return true;
  return status !== "READY";
}

export function describeResyncToast(restored: number): { title: string } {
  if (restored <= 0) return { title: "Library is in sync with Cloudflare" };
  return {
    title: `${restored} file${restored === 1 ? "" : "s"} restored from Cloudflare`,
  };
}

export function buildOptimisticLibraryMedia(input: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  folderName: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  checksumSha256: string;
  thumbnailUrl?: string;
  versionNumber?: number;
  uploadedAtIso?: string;
}): {
  id: string;
  filename: string;
  type: "Video" | "Image" | "Audio";
  dimensions: string;
  durationSec: number | null;
  sizeMb: number;
  modifiedAt: string;
  uploadedBy: string;
  uploadedAt: string;
  version: string;
  thumbnailHue: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  folderId: string | null;
  folderName: string | null;
  usedIn: { playlists: string[]; campaigns: string[]; screens: string[] };
} {
  const day = (input.uploadedAtIso ?? new Date().toISOString()).slice(0, 10);
  const isVideo = input.mimeType.startsWith("video/");
  const isAudio = input.mimeType.startsWith("audio/");
  const dimensions =
    input.width && input.height ? `${input.width} × ${input.height}` : "—";
  const media: ReturnType<typeof buildOptimisticLibraryMedia> = {
    id: input.id,
    filename: input.filename,
    type: isVideo ? "Video" : isAudio ? "Audio" : "Image",
    dimensions,
    durationSec: input.durationMs ? Math.round(input.durationMs / 1000) : null,
    sizeMb: Number((input.sizeBytes / 1_000_000).toFixed(1)),
    modifiedAt: day,
    uploadedBy: "You",
    uploadedAt: day,
    version: `v${input.versionNumber ?? 1}`,
    thumbnailHue: hueFromChecksum(input.checksumSha256),
    folderId: input.folderId,
    folderName: input.folderName,
    usedIn: { playlists: [], campaigns: [], screens: [] },
  };
  if (input.thumbnailUrl) {
    media.thumbnailUrl = input.thumbnailUrl;
    media.previewUrl = input.thumbnailUrl;
  }
  return media;
}

export function isVisibleLibraryStatus(status: string): boolean {
  return status === "READY";
}

/** Only a live READY row owns a key. PROCESSING/archived rows must be restorable. */
export function isReadyLibraryCoveredKey(input: {
  hasMediaRow: boolean;
  status: string;
  archivedAt: string | null | undefined;
}): boolean {
  if (!input.hasMediaRow) return false;
  if (typeof input.archivedAt === "string" && input.archivedAt.length > 0) return false;
  return isVisibleLibraryStatus(input.status);
}

export function incompleteVersionReusable(input: {
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  versionChecksum: string;
  versionSizeBytes: number;
  versionMimeType: string;
  versionStatus: string;
}): boolean {
  if (input.versionStatus !== "PROCESSING" && input.versionStatus !== "FAILED") return false;
  return (
    input.versionChecksum === input.checksum &&
    input.versionSizeBytes === input.sizeBytes &&
    input.versionMimeType === input.mimeType
  );
}

/** New uploads with no prior READY version should be deleted when PUT/confirm fails. */
export function shouldDiscardIncompleteMedia(input: {
  mediaStatus: string;
  currentVersionId: string | null;
  failedVersionId: string;
}): boolean {
  if (
    input.mediaStatus === "READY" &&
    input.currentVersionId &&
    input.currentVersionId !== input.failedVersionId
  ) {
    return false;
  }
  return !input.currentVersionId || input.currentVersionId === input.failedVersionId;
}

export function shouldPurgeAbandonedUpload(input: {
  status: string;
  createdAtIso: string;
  nowMs: number;
  processingTtlMs: number;
}): boolean {
  if (input.status === "FAILED") return true;
  if (input.status !== "PROCESSING") return false;
  const created = Date.parse(input.createdAtIso);
  if (!Number.isFinite(created)) return false;
  return input.nowMs - created >= input.processingTtlMs;
}

export function clientUploadDedupeKey(input: {
  mediaId: string | null;
  folderId: string | null | undefined;
  name: string;
  size: number;
  lastModified: number;
}): string {
  return `${input.mediaId ?? "new"}:${input.folderId ?? ""}:${input.name}:${input.size}:${input.lastModified}`;
}

export type SettledUpload<T> = {
  uploaded: T[];
  failed: Array<{ name: string; message: string }>;
};

export type UploadBatchToast = {
  tone: "success" | "warning" | "error";
  title: string;
  details: string[];
};

/** Toast copy must match what actually landed, including mixed success/failure. */
export function describeUploadBatchToast(
  uploaded: number,
  failed: Array<{ name: string; message: string }>,
): UploadBatchToast {
  if (failed.length === 0) {
    return {
      tone: "success",
      title: `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded`,
      details: [],
    };
  }
  if (uploaded === 0) {
    return {
      tone: "error",
      title: failed.length === 1 ? (failed[0]?.message ?? "Upload failed.") : `${failed.length} files failed to upload`,
      details: failed.length === 1 ? [] : failed.map((item) => item.message),
    };
  }
  return {
    tone: "warning",
    title: `${uploaded} uploaded, ${failed.length} failed`,
    details: failed.map((item) => item.message),
  };
}

export type CompleteStatOutcome = "ready" | "missing" | "retry" | "size-mismatch";

/** After PUT: promote if the object exists; never discard a sibling because HEAD was flaky. */
export function completeStatOutcome(input: {
  objectFound: boolean;
  sizeBytes: number;
  expectedSizeBytes: number;
  statErrored: boolean;
}): CompleteStatOutcome {
  if (input.objectFound) {
    if (input.sizeBytes >= 0 && input.sizeBytes !== input.expectedSizeBytes) return "size-mismatch";
    return "ready";
  }
  if (input.statErrored) return "retry";
  return "missing";
}

export function shouldPromoteIncompleteObject(outcome: CompleteStatOutcome): boolean {
  return outcome === "ready" || outcome === "size-mismatch";
}

/** Run each file on its own. A failure must not skip or abort the rest of the batch. */
export async function settleEachUpload<TFile extends { name: string }, TResult>(
  files: TFile[],
  uploadOne: (file: TFile) => Promise<TResult>,
  describeError: (error: unknown, fileName: string) => string,
  /** Cap parallel PUTs so large videos do not saturate the main thread / network. */
  concurrency = 2,
): Promise<SettledUpload<TResult>> {
  const limit = Math.max(1, Math.floor(concurrency));
  const uploaded: TResult[] = [];
  const failed: Array<{ name: string; message: string }> = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];
      if (!file) continue;
      try {
        uploaded.push(await uploadOne(file));
      } catch (error) {
        failed.push({ name: file.name, message: describeError(error, file.name) });
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, Math.max(files.length, 1)) }, () => worker());
  await Promise.all(workers);
  return { uploaded, failed };
}
