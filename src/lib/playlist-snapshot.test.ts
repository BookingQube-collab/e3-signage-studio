import assert from "node:assert/strict";
import test from "node:test";

import { toManifestAssets } from "./manifest-assets.ts";
import {
  bindPlaylistItemsToAssets,
  isLayoutZonesStale,
  isPlaylistSequenceStale,
  isPlaylistSnapshotStale,
  layoutZonesFingerprint,
  playlistSequenceFingerprint,
} from "./playlist-snapshot.ts";

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

test("playlist sequence fingerprint changes on reorder or transition", () => {
  const a = {
    mediaVersionId: "ver-a",
    durationSeconds: 10,
    transition: "FADE",
  };
  const b = {
    mediaVersionId: "ver-b",
    durationSeconds: 10,
    transition: "WIPE",
  };
  assert.equal(playlistSequenceFingerprint([a, b]), "ver-a:10:FADE|ver-b:10:WIPE");
  assert.equal(isPlaylistSequenceStale([a, b], [a, b]), false);
  assert.equal(isPlaylistSequenceStale([b, a], [a, b]), true);
  assert.equal(
    isPlaylistSequenceStale(
      [a, { ...b, transition: "ZOOM" }],
      [a, b],
    ),
    true,
  );
});

test("image soundtrack binds as a separate local file without dropping the image", () => {
  const bound = bindPlaylistItemsToAssets(
    [
      {
        mediaId: "media-rajan",
        mediaVersionId: "ver-rajan",
        durationSeconds: 10,
        transition: "FADE",
        audioMediaId: "media-bed",
        audioMediaVersionId: "ver-bed",
      },
    ],
    new Map([
      ["ver-rajan", "rajan.jpeg"],
      ["ver-bed", "lobby.mp3"],
    ]),
  );
  assert.equal(bound.length, 1);
  assert.equal(bound[0]?.localFilename, "rajan.jpeg");
  assert.equal(bound[0]?.audioLocalFilename, "lobby.mp3");
  assert.equal(
    playlistSequenceFingerprint([
      { mediaVersionId: "ver-rajan", durationSeconds: 10, transition: "FADE", audioMediaVersionId: "ver-bed" },
    ]),
    "ver-rajan:10:FADE:ver-bed",
  );
  assert.equal(
    isPlaylistSequenceStale(
      [{ mediaVersionId: "ver-rajan", durationSeconds: 10, transition: "FADE", audioMediaVersionId: "ver-bed" }],
      [{ mediaVersionId: "ver-rajan", durationSeconds: 10, transition: "FADE" }],
    ),
    true,
  );
});

test("layout zone fingerprint detects content and geometry edits", () => {
  const a = {
    id: "z1",
    type: "VIDEO",
    contentRef: "media-a",
    xPercent: 0,
    yPercent: 0,
    widthPercent: 70,
    heightPercent: 100,
    fit: "COVER",
    sortOrder: 0,
  };
  const b = { ...a, contentRef: "media-b" };
  const c = { ...a, widthPercent: 50 };
  assert.equal(layoutZonesFingerprint([a]), layoutZonesFingerprint([{ ...a }]));
  assert.notEqual(layoutZonesFingerprint([a]), layoutZonesFingerprint([b]));
  assert.notEqual(layoutZonesFingerprint([a]), layoutZonesFingerprint([c]));
  assert.equal(
    isLayoutZonesStale([a], [a], { layoutId: "lay-1", frozenLayoutId: "lay-1" }),
    false,
  );
  assert.equal(
    isLayoutZonesStale([b], [a], { layoutId: "lay-1", frozenLayoutId: "lay-1" }),
    true,
  );
  assert.equal(
    isLayoutZonesStale([a], [], { layoutId: "lay-1", frozenLayoutId: "lay-1" }),
    true,
  );
  assert.equal(
    isLayoutZonesStale([a], [a], { layoutId: "lay-2", frozenLayoutId: "lay-1" }),
    true,
  );
});
