import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  parseUploadByteLimit,
} from "../../packages/validation/src/index.ts";
import {
  MediaUploadTooLargeError,
  assertUploadSize,
  buildStorageKey,
  collectUploadableFiles,
  fileExtension,
  hueFromChecksum,
  inferMediaMime,
  mediaTypeFromMime,
  normalizeChecksum,
  parseMediaStorageKey,
  renameMediaDisplayName,
  restoredLibraryFilename,
  safeMediaFilename,
  uniqueLibraryFilename,
  uploadLimitsHint,
} from "./media-file.ts";

test("infers mime from extension when the browser omits type", () => {
  assert.equal(inferMediaMime("hero.PNG", ""), "image/png");
  assert.equal(inferMediaMime("loop.mp4", "video/mp4"), "video/mp4");
  assert.equal(inferMediaMime("WhatsApp Video.mp4", "application/octet-stream"), "video/mp4");
  assert.equal(inferMediaMime("clip.mp4", ""), "video/mp4");
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

test("rejects oversized images and videos with type-specific limits", () => {
  assert.throws(() => assertUploadSize("image/png", 0), /empty/i);
  assert.throws(
    () => assertUploadSize("image/png", MAX_IMAGE_UPLOAD_BYTES + 1),
    (err: Error) => err instanceof MediaUploadTooLargeError && err.status === 413 && /25 MB/.test(err.message),
  );
  assert.doesNotThrow(() => assertUploadSize("image/png", MAX_IMAGE_UPLOAD_BYTES));
  assert.throws(
    () => assertUploadSize("video/mp4", MAX_VIDEO_UPLOAD_BYTES + 1),
    (err: Error) => err instanceof MediaUploadTooLargeError && /500 MB/.test(err.message),
  );
  assert.doesNotThrow(() => assertUploadSize("video/mp4", MAX_VIDEO_UPLOAD_BYTES));
  assert.equal(uploadLimitsHint(), "Images up to 25 MB · Videos up to 500 MB");
  assert.equal(parseUploadByteLimit(undefined, 10), 10);
  assert.equal(parseUploadByteLimit("26", 10), 26);
});

test("collectUploadableFiles rejects oversize before upload starts", () => {
  const huge = { name: "hero.jpg", type: "image/jpeg", size: MAX_IMAGE_UPLOAD_BYTES + 1 } as File;
  const ok = { name: "loop.mp4", type: "video/mp4", size: 12_000_000 } as File;
  const { accepted, errors } = collectUploadableFiles([huge, ok]);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.name, "loop.mp4");
  assert.match(errors[0] ?? "", /hero\.jpg/);
  assert.match(errors[0] ?? "", /25 MB/);
});

test("normalizes filenames and checksums", () => {
  assert.equal(safeMediaFilename("C:\\\\tmp\\\\../x.mp4"), "x.mp4");
  assert.equal(fileExtension("Welcome Loop.MP4"), ".mp4");
  assert.equal(normalizeChecksum("Ab"), "ab");
  assert.equal(hueFromChecksum("ff00aa11"), Number.parseInt("ff00aa11", 16) % 360);
});

test("duplicate filenames in a folder get a suffix instead of replacing the first", () => {
  assert.equal(uniqueLibraryFilename(["birthdat.jpeg"], "birthdat.jpeg"), "birthdat (2).jpeg");
  assert.equal(
    uniqueLibraryFilename(["birthdat.jpeg", "birthdat (2).jpeg"], "Birthdat.JPEG"),
    "Birthdat (3).jpeg",
  );
  assert.equal(uniqueLibraryFilename(["party.png"], "birthdat.jpeg"), "birthdat.jpeg");
});

test("rename only changes the display name and keeps a playable extension", () => {
  assert.equal(renameMediaDisplayName("party.jpeg", "birthday"), "birthday.jpeg");
  assert.equal(renameMediaDisplayName("party.jpeg", "birthday.png"), "birthday.png");
  assert.equal(renameMediaDisplayName("loop.mp4", "welcome loop"), "welcome loop.mp4");
  assert.equal(renameMediaDisplayName("hero.jpg", "hero.gif"), "hero.jpg");
});

test("storage keys round-trip org, media id, version, and checksum", () => {
  const key = buildStorageKey({
    organizationId: "11111111-1111-4111-8111-111111111111",
    mediaId: "22222222-2222-4222-8222-222222222222",
    versionNumber: 1,
    checksumSha256: "ab".repeat(32),
    mime: "image/jpeg",
  });
  const parsed = parseMediaStorageKey(key);
  assert.equal(parsed?.organizationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(parsed?.mediaId, "22222222-2222-4222-8222-222222222222");
  assert.equal(parsed?.versionNumber, 1);
  assert.equal(parsed?.checksumSha256, "ab".repeat(32));
  assert.equal(parsed?.mime, "image/jpeg");
  assert.equal(parseMediaStorageKey("not-a-key"), null);
  assert.equal(
    restoredLibraryFilename("22222222-2222-4222-8222-222222222222", "image/jpeg"),
    "restored-22222222.jpg",
  );
});
