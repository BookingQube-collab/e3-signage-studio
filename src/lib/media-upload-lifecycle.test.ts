import assert from "node:assert/strict";
import test from "node:test";

import {
  clientUploadDedupeKey,
  incompleteVersionReusable,
  isVisibleLibraryStatus,
  settleEachUpload,
  shouldDiscardIncompleteMedia,
  shouldPurgeAbandonedUpload,
} from "./media-upload-lifecycle.ts";

test("library only shows READY media", () => {
  assert.equal(isVisibleLibraryStatus("READY"), true);
  assert.equal(isVisibleLibraryStatus("PROCESSING"), false);
  assert.equal(isVisibleLibraryStatus("FAILED"), false);
  assert.equal(isVisibleLibraryStatus("ARCHIVED"), false);
});

test("retries reuse an incomplete version of the same file", () => {
  const same = {
    checksum: "a".repeat(64),
    sizeBytes: 1_900_000,
    mimeType: "image/jpeg",
    versionChecksum: "a".repeat(64),
    versionSizeBytes: 1_900_000,
    versionMimeType: "image/jpeg",
    versionStatus: "PROCESSING",
  };
  assert.equal(incompleteVersionReusable(same), true);
  assert.equal(incompleteVersionReusable({ ...same, versionStatus: "FAILED" }), true);
  assert.equal(incompleteVersionReusable({ ...same, versionStatus: "READY" }), false);
  assert.equal(incompleteVersionReusable({ ...same, versionSizeBytes: 12 }), false);
});

test("failed PUT discards new uploads but keeps a previous READY version", () => {
  assert.equal(
    shouldDiscardIncompleteMedia({
      mediaStatus: "PROCESSING",
      currentVersionId: null,
      failedVersionId: "v-new",
    }),
    true,
  );
  assert.equal(
    shouldDiscardIncompleteMedia({
      mediaStatus: "READY",
      currentVersionId: "v-old",
      failedVersionId: "v-new",
    }),
    false,
  );
});

test("abandoned FAILED rows purge immediately; PROCESSING waits for the upload TTL", () => {
  const now = Date.parse("2026-08-26T17:00:00.000Z");
  assert.equal(
    shouldPurgeAbandonedUpload({
      status: "FAILED",
      createdAtIso: "2026-08-26T16:59:00.000Z",
      nowMs: now,
      processingTtlMs: 15 * 60 * 1000,
    }),
    true,
  );
  assert.equal(
    shouldPurgeAbandonedUpload({
      status: "PROCESSING",
      createdAtIso: "2026-08-26T16:50:00.000Z",
      nowMs: now,
      processingTtlMs: 15 * 60 * 1000,
    }),
    false,
  );
  assert.equal(
    shouldPurgeAbandonedUpload({
      status: "PROCESSING",
      createdAtIso: "2026-08-26T16:40:00.000Z",
      nowMs: now,
      processingTtlMs: 15 * 60 * 1000,
    }),
    true,
  );
});

test("in-flight client uploads of the same file share one key", () => {
  const file = { mediaId: null, folderId: null, name: "hero.jpg", size: 12, lastModified: 1 };
  assert.equal(clientUploadDedupeKey(file), clientUploadDedupeKey(file));
  assert.notEqual(clientUploadDedupeKey(file), clientUploadDedupeKey({ ...file, lastModified: 2 }));
  assert.notEqual(
    clientUploadDedupeKey(file),
    clientUploadDedupeKey({ ...file, folderId: "f-inflata" }),
  );
});

test("a failed file does not cancel the rest of a multi-upload batch", async () => {
  const files = [{ name: "one.jpg" }, { name: "two.jpg" }, { name: "three.jpg" }];
  const attempted: string[] = [];
  const result = await settleEachUpload(
    files,
    async (file) => {
      attempted.push(file.name);
      if (file.name === "two.jpg") {
        throw new Error("canceling statement due to statement timeout");
      }
      return file.name;
    },
    (error, fileName) =>
      error instanceof Error && /canceling statement/i.test(error.message)
        ? `Could not finish uploading ${fileName}. Try that file again.`
        : `Could not upload ${fileName}.`,
  );
  assert.deepEqual(attempted, ["one.jpg", "two.jpg", "three.jpg"]);
  assert.deepEqual(result.uploaded, ["one.jpg", "three.jpg"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.name, "two.jpg");
  assert.match(result.failed[0]?.message ?? "", /two\.jpg/);
  assert.doesNotMatch(result.failed[0]?.message ?? "", /canceling statement/i);
});
