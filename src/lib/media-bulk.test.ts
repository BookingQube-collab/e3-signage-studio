import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBulkDelete,
  applyBulkFolderMove,
  applySelectionClick,
  assertBulkDeleteAllowed,
  inUseDeleteMessage,
  partitionBulkDelete,
  releaseHiddenIfGone,
  selectAllActionLabel,
  selectAllIds,
  selectionCountLabel,
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

test("bulk delete is blocked when a file is in a live playlist, naming that playlist", () => {
  const { deletable, blocked, playlistNames } = partitionBulkDelete(items, ["m-wire", "m-rajan"]);
  assert.deepEqual(
    deletable.map((item) => item.id),
    ["m-wire"],
  );
  assert.deepEqual(
    blocked.map((item) => item.filename),
    ["rajan.jpeg"],
  );
  assert.deepEqual(playlistNames, ["Rajan Room Playlist"]);
  assert.match(inUseDeleteMessage(blocked), /Rajan Room Playlist/);
  assert.match(inUseDeleteMessage(blocked), /rajan\.jpeg/);
  assert.throws(
    () => assertBulkDeleteAllowed(blocked),
    (err: Error) => /Rajan Room Playlist/.test(err.message) && /rajan\.jpeg/.test(err.message),
  );
  assert.doesNotThrow(() => assertBulkDeleteAllowed([]));
  const remaining = applyBulkDelete(items, deletable.map((item) => item.id));
  assert.equal(
    remaining.some((item) => item.id === "m-wire"),
    false,
  );
  assert.equal(
    remaining.some((item) => item.id === "m-rajan"),
    true,
  );
});
