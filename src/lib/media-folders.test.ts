import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLDER_DUPLICATE_MESSAGE,
  applyFolderCascadeDelete,
  applyFolderMove,
  assertFolderName,
  countFilesInFolder,
  createFolderRecord,
  folderCardLabel,
  folderDeleteCopy,
  isDuplicateFolderName,
  foldersInLibraryView,
  libraryViewFor,
  mediaInLibraryView,
  resolveUploadFolderId,
} from "./media-folders.ts";

const inflata = { id: "m1", filename: "banner.png", folderId: "f-inflata" };
const rajan = { id: "m2", filename: "rajan.jpeg", folderId: "f-office" };
const unfiled = { id: "m3", filename: "wireframe.png", folderId: null };
const items = [inflata, rajan, unfiled];

test("create folder trims name and rejects blanks or duplicates", () => {
  assert.equal(assertFolderName("  Birthday - Poppy  "), "Birthday - Poppy");
  assert.throws(() => assertFolderName("   "), /required/i);
  assert.equal(isDuplicateFolderName(["InflataPark"], "inflatapark"), true);
  assert.throws(
    () => createFolderRecord(["InflataPark"], "InflataPark", "f1"),
    (err: Error) => err.message === FOLDER_DUPLICATE_MESSAGE,
  );
  assert.deepEqual(createFolderRecord(["InflataPark"], "Rajan Office", "f2"), {
    id: "f2",
    name: "Rajan Office",
  });
});

test("list by folder returns only that folder’s files", () => {
  const view = libraryViewFor("", "f-office");
  assert.deepEqual(mediaInLibraryView(items, view), [rajan]);
});

test("unfiled items stay at the library root", () => {
  const view = libraryViewFor("", null);
  assert.deepEqual(mediaInLibraryView(items, view), [unfiled]);
});

test("search matches across folders and labels unfiled", () => {
  const view = libraryViewFor("rajan", "f-inflata");
  assert.equal(view.mode, "search");
  assert.deepEqual(mediaInLibraryView(items, view), [rajan]);
  assert.equal(folderCardLabel("Rajan Office", true), "Rajan Office");
  assert.equal(folderCardLabel(null, true), "Unfiled");
  assert.equal(folderCardLabel(null, false), null);
  const folders = [
    { id: "f-inflata", name: "InflataPark" },
    { id: "f-office", name: "Rajan Office" },
  ];
  assert.deepEqual(foldersInLibraryView(folders, view), [{ id: "f-office", name: "Rajan Office" }]);
  assert.equal(foldersInLibraryView(folders, libraryViewFor("", "f-inflata")).length, 0);
  assert.equal(foldersInLibraryView(folders, libraryViewFor("", null)).length, 2);
});

test("move assigns a folder or returns the item to unfiled", () => {
  const intoFolder = applyFolderMove(items, "m3", "f-inflata", "InflataPark");
  assert.equal(intoFolder.find((m) => m.id === "m3")?.folderId, "f-inflata");
  const back = applyFolderMove(intoFolder, "m3", null, null);
  assert.equal(back.find((m) => m.id === "m3")?.folderId, null);
});

test("uploads land in the current folder, or unfiled at root", () => {
  assert.equal(resolveUploadFolderId("f-inflata"), "f-inflata");
  assert.equal(resolveUploadFolderId(null), null);
  assert.equal(resolveUploadFolderId(undefined), null);
});

test("folder delete warns and removes files in that folder", () => {
  assert.equal(countFilesInFolder(items, "f-office"), 1);
  const empty = folderDeleteCopy("Unfiled extras", 0);
  assert.equal(empty.confirmLabel, "Delete folder");
  assert.match(empty.description, /cannot be undone/i);
  const filled = folderDeleteCopy("InflataPark", 6);
  assert.equal(filled.confirmLabel, "Delete folder and 6 files");
  assert.match(filled.description, /folder and 6 files inside/i);
  assert.match(filled.detail ?? "", /InflataPark has 6 files/);
  const folders = [
    { id: "f-inflata", name: "InflataPark" },
    { id: "f-office", name: "Rajan Office" },
  ];
  const cascaded = applyFolderCascadeDelete(items, folders, "f-inflata");
  assert.equal(
    cascaded.media.some((item) => item.folderId === "f-inflata"),
    false,
  );
  assert.equal(
    cascaded.folders.some((folder) => folder.id === "f-inflata"),
    false,
  );
  assert.equal(cascaded.media.some((item) => item.id === "m2"), true);
});
