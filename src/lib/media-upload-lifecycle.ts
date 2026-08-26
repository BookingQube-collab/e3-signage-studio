/** Rules for pending uploads: hide from the library until PUT+confirm succeed. */

export function isVisibleLibraryStatus(status: string): boolean {
  return status === "READY";
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
