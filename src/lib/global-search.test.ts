import assert from "node:assert/strict";
import test from "node:test";

import { buildGlobalSearchHits } from "./global-search.ts";

test("buildGlobalSearchHits returns empty for blank query", () => {
  assert.deepEqual(
    buildGlobalSearchHits("  ", { screens: [{ id: "1", name: "Lobby", locationName: "HQ" }] }),
    [],
  );
});

test("buildGlobalSearchHits matches across entity kinds", () => {
  const hits = buildGlobalSearchHits("lob", {
    screens: [{ id: "s1", name: "Lobby A", locationName: "Mall" }],
    media: [{ id: "m1", filename: "lobby-banner.jpg", type: "Image", folderName: null }],
    campaigns: [{ id: "c1", name: "Lobby Promo", status: "Live" }],
    playlists: [{ id: "p1", name: "Other", status: "Active" }],
  });
  assert.equal(hits.length, 3);
  assert.deepEqual(
    hits.map((h) => h.kind),
    ["screen", "media", "campaign"],
  );
});

test("buildGlobalSearchHits caps per kind", () => {
  const screens = Array.from({ length: 8 }, (_, i) => ({
    id: `s${i}`,
    name: `Screen ${i}`,
    locationName: "HQ",
  }));
  const hits = buildGlobalSearchHits("screen", { screens });
  assert.equal(hits.length, 5);
});
