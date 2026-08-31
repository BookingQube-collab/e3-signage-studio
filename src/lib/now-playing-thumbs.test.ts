import assert from "node:assert/strict";
import test from "node:test";

import { uniqueNowPlayingMediaIds, withNowPlayingThumbnails } from "./now-playing-thumbs.ts";
import type { Screen } from "../types/index.ts";

function screen(partial: Partial<Screen> & Pick<Screen, "id" | "name">): Screen {
  return {
    locationId: "loc-1",
    locationName: "Lobby",
    groupIds: [],
    status: "online",
    screenType: "Android TV",
    orientation: "Landscape",
    resolution: "1920 × 1080",
    playlistId: null,
    playlistName: null,
    nowPlaying: null,
    nowPlayingMediaId: null,
    nowPlayingMediaType: null,
    nowPlayingThumbnailUrl: null,
    nowPlayingPreviewUrl: null,
    syncState: "Ready",
    syncProgress: 0,
    lastSeen: "just now",
    lastSync: "just now",
    localVersion: "v1",
    cloudVersion: "v1",
    storageUsedGb: 0,
    storageTotalGb: 64,
    appVersion: "1.0",
    lastError: null,
    ...partial,
  };
}

test("withNowPlayingThumbnails leaves rows alone when no map", () => {
  const rows = [screen({ id: "s1", name: "A", nowPlayingMediaId: "m1" })];
  assert.equal(withNowPlayingThumbnails(rows, undefined), rows);
  assert.deepEqual(withNowPlayingThumbnails(rows, {}), rows);
});

test("withNowPlayingThumbnails merges signed stills by media id", () => {
  const rows = [
    screen({ id: "s1", name: "A", nowPlayingMediaId: "m1", nowPlaying: "Clip" }),
    screen({ id: "s2", name: "B", nowPlayingMediaId: "m2" }),
    screen({ id: "s3", name: "C" }),
  ];
  const merged = withNowPlayingThumbnails(rows, {
    m1: "https://cdn.example/still.jpg",
    m2: null,
  });
  assert.equal(merged[0]?.nowPlayingThumbnailUrl, "https://cdn.example/still.jpg");
  assert.equal(merged[0]?.nowPlayingPreviewUrl, null);
  assert.equal(merged[1]?.nowPlayingThumbnailUrl, null);
  assert.equal(merged[2]?.nowPlayingThumbnailUrl, null);
});

test("uniqueNowPlayingMediaIds dedupes and sorts", () => {
  const rows = [
    screen({ id: "s1", name: "A", nowPlayingMediaId: "m2" }),
    screen({ id: "s2", name: "B", nowPlayingMediaId: "m1" }),
    screen({ id: "s3", name: "C", nowPlayingMediaId: "m2" }),
    screen({ id: "s4", name: "D" }),
  ];
  assert.deepEqual(uniqueNowPlayingMediaIds(rows), ["m1", "m2"]);
});
