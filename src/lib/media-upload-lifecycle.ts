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
): Promise<SettledUpload<TResult>> {
  const rows = await Promise.all(
    files.map(async (file) => {
      try {
        return { uploaded: await uploadOne(file) };
      } catch (error) {
        return { failed: { name: file.name, message: describeError(error, file.name) } };
      }
    }),
  );
  const uploaded: TResult[] = [];
  const failed: Array<{ name: string; message: string }> = [];
  for (const row of rows) {
    if ("uploaded" in row) uploaded.push(row.uploaded);
    else failed.push(row.failed);
  }
  return { uploaded, failed };
}
