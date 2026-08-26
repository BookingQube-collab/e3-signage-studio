import assert from "node:assert/strict";
import test from "node:test";

import { toManifestAssets } from "./manifest-assets.ts";

test("builds unique READY assets and skips unfinished media", () => {
  const assets = toManifestAssets(
    [
      {
        id: "video-1",
        name: "loop.mp4",
        type: "VIDEO",
        currentVersionId: "ver-video",
        status: "READY",
      },
      {
        id: "image-1",
        name: "hero.jpg",
        type: "IMAGE",
        currentVersionId: "ver-image",
        status: "READY",
      },
      {
        id: "pending",
        name: "soon.png",
        type: "IMAGE",
        currentVersionId: null,
        status: "UPLOADING",
      },
      {
        id: "video-1",
        name: "loop-dup.mp4",
        type: "VIDEO",
        currentVersionId: "ver-video",
        status: "READY",
      },
    ],
    [
      { id: "ver-video", checksumSha256: "a".repeat(64), sizeBytes: 500_000_000 },
      { id: "ver-image", checksumSha256: "b".repeat(64), sizeBytes: 2_000_000 },
    ],
  );
  assert.equal(assets.length, 2);
  assert.deepEqual(
    assets.map((row) => row.mediaId),
    ["video-1", "image-1"],
  );
  assert.equal(assets[1]?.fileSize, 2_000_000);
});

test("keeps two distinct READY images and does not unique by checksum", () => {
  const assets = toManifestAssets(
    [
      {
        id: "image-a",
        name: "rajan.jpeg",
        type: "IMAGE",
        currentVersionId: "ver-a",
        status: "READY",
      },
      {
        id: "image-b",
        name: "wireframe.png",
        type: "IMAGE",
        currentVersionId: "ver-b",
        status: "READY",
      },
    ],
    [
      { id: "ver-a", checksumSha256: "a".repeat(64), sizeBytes: 100 },
      { id: "ver-b", checksumSha256: "b".repeat(64), sizeBytes: 200 },
    ],
  );
  assert.equal(assets.length, 2);
  assert.deepEqual(
    assets.map((row) => row.localFilename),
    ["rajan.jpeg", "wireframe.png"],
  );
});

test("drops READY rows whose current version is missing", () => {
  const assets = toManifestAssets(
    [
      {
        id: "orphan",
        name: "gone.jpg",
        type: "IMAGE",
        currentVersionId: "missing",
        status: "READY",
      },
    ],
    [],
  );
  assert.deepEqual(assets, []);
});
