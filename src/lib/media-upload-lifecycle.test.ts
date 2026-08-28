import assert from "node:assert/strict";
import test from "node:test";

import {
  clientUploadDedupeKey,
  completeStatOutcome,
  describeUploadBatchToast,
  incompleteVersionReusable,
  isVisibleLibraryStatus,
  settleEachUpload,
  shouldDiscardIncompleteMedia,
  shouldPromoteIncompleteObject,
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
  assert.deepEqual(attempted.sort(), ["one.jpg", "three.jpg", "two.jpg"]);
  assert.deepEqual(result.uploaded, ["one.jpg", "three.jpg"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.name, "two.jpg");
  assert.match(result.failed[0]?.message ?? "", /two\.jpg/);
  assert.doesNotMatch(result.failed[0]?.message ?? "", /canceling statement/i);
});

test("a hung file does not skip a sibling that can still complete", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: string[] = [];
  const finished: string[] = [];
  const pending = settleEachUpload(
    [{ name: "one.jpg" }, { name: "two.jpg" }],
    async (file) => {
      started.push(file.name);
      if (file.name === "one.jpg") await gate;
      finished.push(file.name);
      return file.name;
    },
    () => "failed",
  );
  const startedBoth = await new Promise<boolean>((resolve) => {
    const check = () => {
      if (started.length === 2) {
        resolve(true);
        return;
      }
      setTimeout(check, 5);
    };
    check();
    setTimeout(() => resolve(started.length === 2), 500);
  });
  assert.equal(startedBoth, true);
  assert.deepEqual(finished, ["two.jpg"]);
  release();
  const result = await pending;
  assert.deepEqual(result.uploaded.sort(), ["one.jpg", "two.jpg"]);
  assert.equal(result.failed.length, 0);
});

test("partial batch toast names the failure instead of claiming only the successes", () => {
  const mixed = describeUploadBatchToast(1, [
    { name: "party.jpeg", message: "Could not finish uploading party.jpeg. Try that file again." },
  ]);
  assert.equal(mixed.tone, "warning");
  assert.equal(mixed.title, "1 uploaded, 1 failed");
  assert.match(mixed.details[0] ?? "", /party\.jpeg/);
  const ok = describeUploadBatchToast(2, []);
  assert.equal(ok.tone, "success");
  assert.equal(ok.title, "2 files uploaded");
  const none = describeUploadBatchToast(0, [{ name: "a.jpg", message: "Could not upload a.jpg." }]);
  assert.equal(none.tone, "error");
  assert.match(none.title, /a\.jpg/);
});

test("an object that landed in storage is completed even when HEAD size is unknown", () => {
  assert.equal(
    completeStatOutcome({
      objectFound: true,
      sizeBytes: -1,
      expectedSizeBytes: 640_000,
      statErrored: false,
    }),
    "ready",
  );
  assert.equal(
    shouldPromoteIncompleteObject(
      completeStatOutcome({
        objectFound: true,
        sizeBytes: 12,
        expectedSizeBytes: 640_000,
        statErrored: false,
      }),
    ),
    true,
  );
  assert.equal(
    completeStatOutcome({
      objectFound: false,
      sizeBytes: -1,
      expectedSizeBytes: 1,
      statErrored: true,
    }),
    "retry",
  );
  assert.equal(
    completeStatOutcome({
      objectFound: false,
      sizeBytes: -1,
      expectedSizeBytes: 1,
      statErrored: false,
    }),
    "missing",
  );
});
