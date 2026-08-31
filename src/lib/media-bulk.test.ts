import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBulkDelete,
  applyBulkFolderMove,
  applySelectionClick,
  assertBulkDeleteAllowed,
  blockingLivePlaylistIds,
  inUseDeleteMessage,
  isLivePlaylistStatus,
  liveUsagePlaylistIds,
  liveUsagePlaylistNames,
  mediaStorageDeleteCopy,
  partitionBulkDelete,
  pruneHiddenIds,
  releaseHiddenIfGone,
  selectAllActionLabel,
  selectAllIds,
  selectionCountLabel,
  shouldDeleteFromStorage,
  toggleSelectAll,
  unionIds,
  withoutIds,
} from "./media-bulk.ts";

const unused = {
  id: "m-wire",
  filename: "wireframe.png",
  folderId: null as string | null,
  folderName: null as string | null,
  usedIn: { playlists: [] as string[], campaigns: [] as string[], screens: [] as string[] },
};
const inflata = {
  id: "m-ninjago",
  filename: "ninjago-welcome-special-day.jpg",
  folderId: "f-inflata",
  folderName: "InflataPark",
  usedIn: { playlists: [] as string[], campaigns: [] as string[], screens: [] as string[] },
};
const live = {
  id: "m-rajan",
  filename: "rajan.jpeg",
  folderId: null as string | null,
  folderName: null as string | null,
  usedIn: {
    playlists: ["Rajan Room Playlist"],
    campaigns: ["Rajan Office Live"],
    screens: ["Rajan Room TV"],
  },
};
const items = [unused, inflata, live];
const visibleIds = items.map((item) => item.id);

test("ctrl-click toggles one file and shift-click selects a range", () => {
  const first = applySelectionClick(new Set(), visibleIds, "m-wire", { toggle: true, range: false }, null);
  assert.deepEqual([...first.selected], ["m-wire"]);
  const range = applySelectionClick(
    first.selected,
    visibleIds,
    "m-rajan",
    { toggle: false, range: true },
    first.anchorId,
  );
  assert.deepEqual([...range.selected], visibleIds);
  assert.equal(selectionCountLabel(3), "3 selected");
  assert.deepEqual([...selectAllIds(visibleIds)], visibleIds);
  assert.equal(selectAllActionLabel(false), "Select all");
  assert.equal(selectAllActionLabel(true), "Deselect all");
  assert.deepEqual([...toggleSelectAll(false, visibleIds)], visibleIds);
  assert.equal(toggleSelectAll(true, visibleIds).size, 0);
});

test("hidden ids stay until a refetch omits the deleted files", () => {
  const hidden = unionIds(new Set(), ["m-wire", "m-ninjago"]);
  const afterStale = releaseHiddenIfGone(hidden, items, ["m-wire"]);
  assert.equal(afterStale.has("m-wire"), true);
  const remaining = applyBulkDelete(items, ["m-wire"]);
  const afterFresh = releaseHiddenIfGone(hidden, remaining, ["m-wire"]);
  assert.equal(afterFresh.has("m-wire"), false);
  assert.equal(afterFresh.has("m-ninjago"), true);
  assert.deepEqual([...withoutIds(hidden, ["m-ninjago"])], ["m-wire"]);
  const stillHidden = new Set(["m-wire"]);
  const prunedStale = pruneHiddenIds(stillHidden, items);
  assert.equal(prunedStale.has("m-wire"), true);
  assert.equal(prunedStale, stillHidden);
  const prunedGone = pruneHiddenIds(stillHidden, remaining);
  assert.equal(prunedGone.has("m-wire"), false);
  const uploadedAgain = [...remaining, unused];
  assert.deepEqual(
    [...withoutIds(unionIds(new Set(), ["m-wire"]), uploadedAgain.map((item) => item.id))],
    [],
  );
});

test("bulk move assigns a folder to every selected file", () => {
  const moved = applyBulkFolderMove(items, ["m-wire", "m-rajan"], "f-inflata", "InflataPark");
  assert.equal(moved.find((item) => item.id === "m-wire")?.folderId, "f-inflata");
  assert.equal(moved.find((item) => item.id === "m-rajan")?.folderName, "InflataPark");
  assert.equal(moved.find((item) => item.id === "m-ninjago")?.folderId, "f-inflata");
  const unfiled = applyBulkFolderMove(moved, ["m-wire", "m-rajan"], null, null);
  assert.equal(unfiled.find((item) => item.id === "m-wire")?.folderId, null);
  assert.equal(unfiled.find((item) => item.id === "m-rajan")?.folderId, null);
});

test("archived and deleted playlists do not count as live usage", () => {
  assert.equal(isLivePlaylistStatus("ACTIVE", null), true);
  assert.equal(isLivePlaylistStatus("DRAFT", null), true);
  assert.equal(isLivePlaylistStatus("SCHEDULED", null), true);
  assert.equal(isLivePlaylistStatus("ARCHIVED", null), false);
  assert.equal(isLivePlaylistStatus("ACTIVE", "2026-08-27T00:00:00Z"), false);
  assert.equal(isLivePlaylistStatus("DRAFT", "2026-08-27T00:00:00Z"), false);
  assert.deepEqual(
    liveUsagePlaylistNames([
      { id: "p-poppy", name: "Poppy Birthday", status: "ARCHIVED", archived_at: "2026-08-27T00:00:00Z" },
      { id: "p-rajan", name: "Rajan Room Playlist", status: "ACTIVE", archived_at: null },
    ]),
    ["Rajan Room Playlist"],
  );
  assert.deepEqual(
    [...liveUsagePlaylistIds([
      { id: "p-poppy", name: "Poppy Birthday", status: "ARCHIVED", archived_at: "2026-08-27T00:00:00Z" },
      { id: "p-rajan", name: "Rajan Room Playlist", status: "ACTIVE", archived_at: null },
    ])],
    ["p-rajan"],
  );
  const ghost = {
    id: "m-poppy",
    filename: "ninjago-happy-6th-birthday-poppy.jpg",
    usedIn: {
      playlists: liveUsagePlaylistNames([
        { name: "Poppy Birthday", status: "ARCHIVED", archived_at: "2026-08-27T00:00:00Z" },
      ]),
      campaigns: [] as string[],
      screens: [] as string[],
    },
  };
  const { deletable, blocked } = partitionBulkDelete([ghost], ["m-poppy"]);
  assert.deepEqual(
    deletable.map((item) => item.filename),
    ["ninjago-happy-6th-birthday-poppy.jpg"],
  );
  assert.equal(blocked.length, 0);
  assert.doesNotThrow(() => assertBulkDeleteAllowed(blocked));
});

test("orphan library playlists do not block media delete without a screen or campaign link", () => {
  const playlists = [
    { id: "p-draft", name: "Draft only", status: "DRAFT", archived_at: null },
    { id: "p-live", name: "Test Rajan Room", status: "ACTIVE", archived_at: null },
    { id: "p-old", name: "Archived Room", status: "ARCHIVED", archived_at: "2026-08-27T00:00:00Z" },
  ];
  assert.deepEqual([...blockingLivePlaylistIds(playlists, [])], []);
  assert.deepEqual([...blockingLivePlaylistIds(playlists, ["p-draft"])], ["p-draft"]);
  assert.deepEqual([...blockingLivePlaylistIds(playlists, ["p-live", "p-old"])], ["p-live"]);
  assert.deepEqual([...blockingLivePlaylistIds(playlists, ["p-missing"])], []);
});
test("bulk delete allows in-use files and warns with playlist names", () => {
  const { deletable, blocked, playlistNames } = partitionBulkDelete(items, ["m-wire", "m-rajan"]);
  assert.deepEqual(
    deletable.map((item) => item.id),
    ["m-wire", "m-rajan"],
  );
  assert.deepEqual(
    blocked.map((item) => item.filename),
    ["rajan.jpeg"],
  );
  assert.deepEqual(playlistNames, ["Rajan Room Playlist"]);
  assert.match(inUseDeleteMessage(blocked), /Rajan Room Playlist/);
  assert.match(inUseDeleteMessage(blocked), /rajan\.jpeg/);
  assert.match(inUseDeleteMessage(blocked), /removes/);
  assert.doesNotThrow(() => assertBulkDeleteAllowed(blocked));
  assert.doesNotThrow(() => assertBulkDeleteAllowed([]));
  const remaining = applyBulkDelete(
    items,
    deletable.map((item) => item.id),
  );
  assert.equal(
    remaining.some((item) => item.id === "m-wire"),
    false,
  );
  assert.equal(
    remaining.some((item) => item.id === "m-rajan"),
    false,
  );
});

test("partitionBulkDelete does not throw when usedIn is missing", () => {
  const orphan = { id: "m-orphan", filename: "orphan.png" };
  const { deletable, blocked } = partitionBulkDelete([orphan], ["m-orphan"]);
  assert.deepEqual(
    deletable.map((item) => item.id),
    ["m-orphan"],
  );
  assert.equal(blocked.length, 0);
});

test("deleteFromStorage defaults to hard-delete and R2/supabase copy differs", () => {
  assert.equal(shouldDeleteFromStorage(undefined), true);
  assert.equal(shouldDeleteFromStorage(null), true);
  assert.equal(shouldDeleteFromStorage(false), false);
  assert.equal(shouldDeleteFromStorage(true), true);
  const r2 = mediaStorageDeleteCopy("r2");
  assert.equal(r2.checkboxLabel, "Also delete from Cloudflare?");
  assert.match(r2.checkedHint, /Cloudflare R2/);
  assert.match(r2.uncheckedHint, /library records only/i);
  const supabase = mediaStorageDeleteCopy("supabase");
  assert.equal(supabase.checkboxLabel, "Also delete from storage?");
  assert.match(supabase.checkedHint, /storage/);
  assert.doesNotMatch(supabase.checkboxLabel, /Cloudflare/i);
});
