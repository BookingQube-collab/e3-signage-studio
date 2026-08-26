import assert from "node:assert/strict";
import test from "node:test";

import { toManifestAssets } from "./manifest-assets.ts";
import { bindPlaylistItemsToAssets, isPlaylistSnapshotStale } from "./playlist-snapshot.ts";

test("two-item playlist keeps both READY assets and both bound items", () => {
  const assets = toManifestAssets(
    [
      {
        id: "media-rajan",
        name: "rajan.jpeg",
        type: "IMAGE",
        currentVersionId: "ver-rajan",
        status: "READY",
      },
      {
        id: "media-wireframe",
        name: "Amazon Seller Dashboard - Wireframe.png",
        type: "IMAGE",
        currentVersionId: "ver-wireframe",
        status: "READY",
      },
    ],
    [
      { id: "ver-rajan", checksumSha256: "a".repeat(64), sizeBytes: 120_000 },
      { id: "ver-wireframe", checksumSha256: "b".repeat(64), sizeBytes: 340_000 },
    ],
  );
  assert.equal(assets.length, 2);
  assert.deepEqual(
    assets.map((row) => row.mediaId),
    ["media-rajan", "media-wireframe"],
  );

  const byVersion = new Map(assets.map((row) => [row.mediaVersionId, row.localFilename]));
  const bound = bindPlaylistItemsToAssets(
    [
      {
        mediaId: "media-rajan",
        mediaVersionId: "ver-rajan",
        durationSeconds: 10,
        transition: "FADE",
      },
      {
        mediaId: "media-wireframe",
        mediaVersionId: "ver-wireframe",
        durationSeconds: 10,
        transition: "FADE",
      },
    ],
    byVersion,
  );
  assert.deepEqual(
    bound.map((row) => row.localFilename),
    ["rajan.jpeg", "Amazon Seller Dashboard - Wireframe.png"],
  );
});

test("frozen one-asset snapshot drops the second live playlist item", () => {
  const bound = bindPlaylistItemsToAssets(
    [
      {
        mediaId: "media-rajan",
        mediaVersionId: "ver-rajan",
        durationSeconds: 10,
        transition: "FADE",
      },
      {
        mediaId: "media-wireframe",
        mediaVersionId: "ver-wireframe",
        durationSeconds: 10,
        transition: "FADE",
      },
    ],
    new Map([["ver-rajan", "rajan.jpeg"]]),
  );
  assert.deepEqual(
    bound.map((row) => row.mediaId),
    ["media-rajan"],
  );
  assert.equal(isPlaylistSnapshotStale(["ver-rajan", "ver-wireframe"], ["ver-rajan"]), true);
  assert.equal(isPlaylistSnapshotStale(["ver-rajan"], ["ver-rajan"]), false);
});
