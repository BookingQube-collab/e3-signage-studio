import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUploadSize,
  buildStorageKey,
  fileExtension,
  hueFromChecksum,
  inferMediaMime,
  mediaTypeFromMime,
  normalizeChecksum,
  safeMediaFilename,
} from "./media-file.ts";

test("infers mime from extension when the browser omits type", () => {
  assert.equal(inferMediaMime("hero.PNG", ""), "image/png");
  assert.equal(inferMediaMime("loop.mp4", "video/mp4"), "video/mp4");
  assert.equal(inferMediaMime("bad.gif", "image/gif"), null);
});

test("maps mime to canonical media type", () => {
  assert.equal(mediaTypeFromMime("video/mp4"), "VIDEO");
  assert.equal(mediaTypeFromMime("image/webp"), "IMAGE");
});

test("builds append-only storage keys that include org, media, version, and checksum", () => {
  const key = buildStorageKey({
    organizationId: "11111111-1111-4111-8111-111111111111",
    mediaId: "22222222-2222-4222-8222-222222222222",
    versionNumber: 2,
    checksumSha256: "A".repeat(64),
    mime: "image/jpeg",
  });
  assert.match(key, /\/v2\//);
  assert.ok(key.endsWith(".jpg"));
  assert.ok(key.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
});

test("rejects oversized images and empty files", () => {
  assert.throws(() => assertUploadSize("image/png", 0));
  assert.throws(() => assertUploadSize("image/png", 51 * 1024 * 1024));
  assert.doesNotThrow(() => assertUploadSize("image/png", 1024));
});

test("normalizes filenames and checksums", () => {
  assert.equal(safeMediaFilename("C:\\\\tmp\\\\../x.mp4"), "x.mp4");
  assert.equal(fileExtension("Welcome Loop.MP4"), ".mp4");
  assert.equal(normalizeChecksum("Ab"), "ab");
  assert.equal(hueFromChecksum("ff00aa11"), Number.parseInt("ff00aa11", 16) % 360);
});
