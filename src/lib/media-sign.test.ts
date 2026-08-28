import assert from "node:assert/strict";
import test from "node:test";

import { mediaKeysToSign } from "./media-sign.ts";

test("library list signs image thumbs and video files", () => {
  assert.deepEqual(
    mediaKeysToSign({ previewKey: "img/a.jpg", isImage: true, signAllPreviews: false }),
    ["img/a.jpg"],
  );
  assert.deepEqual(
    mediaKeysToSign({ previewKey: "vid/a.mp4", isImage: false, signAllPreviews: false }),
    ["vid/a.mp4"],
  );
});

test("detail view still signs the preview for any ready file", () => {
  assert.deepEqual(
    mediaKeysToSign({ previewKey: "vid/a.mp4", isImage: false, signAllPreviews: true }),
    ["vid/a.mp4"],
  );
  assert.deepEqual(
    mediaKeysToSign({ previewKey: null, isImage: true, signAllPreviews: true }),
    [],
  );
});
