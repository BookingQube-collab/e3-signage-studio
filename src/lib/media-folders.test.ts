import assert from "node:assert/strict";
import test from "node:test";

import {
  FOLDER_DUPLICATE_MESSAGE,
  applyFolderCascadeDelete,
  applyFolderMove,
  applyMovedMediaBulk,
  applyRenamedMedia,
  applyUploadedMedia,
  assertFolderName,
  countFilesInFolder,
  createFolderRecord,
  findFolderByName,
  folderCardLabel,
  folderDeleteCopy,
  isArchivedFolder,
  isDuplicateFolderName,
  foldersInLibraryView,
  libraryViewFor,
  liveFolders,
  mediaInLibraryView,
  mergeLibraryMedia,
  resolveFolderCreate,
  resolveUploadFolderId,
  normalizeFolderName,
  uniqueFoldersByName,
  upsertFolder,
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

test("two files in the same folder both list even when filenames collide", () => {
  const colliding = [
    { id: "m-a", filename: "birthdat.jpeg", folderId: "f-inflata" },
    { id: "m-b", filename: "birthdat.jpeg", folderId: "f-inflata" },
  ];
  const view = libraryViewFor("", "f-inflata");
  assert.equal(mediaInLibraryView(colliding, view).length, 2);
  assert.equal(mergeLibraryMedia(colliding.slice(0, 1), colliding.slice(1)).length, 2);
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

test("recreating a folder name reuses the live row instead of stacking a duplicate card", () => {
  const live = [
    { id: "f-old", name: "InflataPark", fileCount: 0 },
    { id: "f-office", name: "Rajan Office", fileCount: 2 },
  ];
  const reused = resolveFolderCreate(live, "  inflatapark  ", "f-new");
  assert.equal(reused.reused, true);
  assert.equal(reused.folder.id, "f-old");
  assert.equal(findFolderByName(live, "INFLATAPARK")?.id, "f-old");
  const created = resolveFolderCreate(live, "Birthday - Poppy", "f-new");
  assert.equal(created.reused, false);
  assert.deepEqual(created.folder, { id: "f-new", name: "Birthday - Poppy" });
  const dupes = uniqueFoldersByName([
    { id: "f-old", name: "InflataPark", fileCount: 0 },
    { id: "f-new", name: "inflatapark", fileCount: 3 },
    { id: "f-office", name: "Rajan Office", fileCount: 2 },
  ]);
  assert.equal(dupes.length, 2);
  assert.equal(dupes.find((folder) => folder.name.toLowerCase() === "inflatapark")?.id, "f-new");
  const upserted = upsertFolder(live, { id: "f-new", name: "InflataPark", fileCount: 3 });
  assert.equal(upserted.filter((folder) => folderNameMatch(folder.name)).length, 1);
  assert.equal(upserted.find((folder) => folderNameMatch(folder.name))?.id, "f-new");
});

test("archived folders stay out of the library and are not revived by create or upsert", () => {
  const archived = {
    id: "f-old",
    name: "InflataPark",
    fileCount: 4,
    archivedAt: "2026-08-27T16:00:00.000Z",
  };
  const office = { id: "f-office", name: "Rajan Office", fileCount: 0 };
  const mixed = [archived, office];
  assert.equal(isArchivedFolder(archived), true);
  assert.equal(isArchivedFolder({}), false);
  assert.equal(isArchivedFolder({ archivedAt: null }), false);
  assert.equal(normalizeFolderName(undefined as unknown as string), "");
  assert.deepEqual(
    liveFolders(mixed).map((folder) => folder.id),
    ["f-office"],
  );
  assert.equal(
    uniqueFoldersByName(mixed).some((folder) => folder.id === "f-old"),
    false,
  );
  assert.equal(uniqueFoldersByName([office, { id: "f-legacy", name: "Legacy" }]).length, 2);
  const created = resolveFolderCreate(mixed, "InflataPark", "f-new");
  assert.equal(created.reused, false);
  assert.deepEqual(created.folder, { id: "f-new", name: "InflataPark" });
  const revived = upsertFolder(mixed, { ...archived, fileCount: 4 });
  assert.equal(
    revived.some((folder) => folder.id === "f-old"),
    false,
  );
  assert.equal(
    revived.some((folder) => folder.id === "f-office"),
    true,
  );
});

function folderNameMatch(name: string): boolean {
  return name.toLowerCase() === "inflatapark";
}

test("multi-upload into a folder merges files immediately and bumps the card count", () => {
  const folders = [
    { id: "f-inflata", name: "InflataPark", fileCount: 1 },
    { id: "f-office", name: "Rajan Office", fileCount: 1 },
  ];
  const added = [
    { id: "m4", filename: "one.png", folderId: "f-inflata" },
    { id: "m5", filename: "two.png", folderId: "f-inflata" },
  ];
  const next = applyUploadedMedia(items, folders, added);
  assert.equal(next.media.some((item) => item.id === "m4"), true);
  assert.equal(next.media.filter((item) => item.folderId === "f-inflata").length, 3);
  assert.equal(next.folders.find((folder) => folder.id === "f-inflata")?.fileCount, 3);
  const retry = applyUploadedMedia(next.media, next.folders, added);
  assert.equal(retry.folders.find((folder) => folder.id === "f-inflata")?.fileCount, 3);
  assert.equal(mergeLibraryMedia(items, [{ id: "m1", filename: "banner-v2.png", folderId: "f-inflata" }]).length, 3);
});

test("rename keeps the same id in the same folder", () => {
  const renamed = applyRenamedMedia(items, { ...inflata, filename: "birthday.png" });
  assert.equal(renamed.length, 3);
  assert.equal(renamed.find((item) => item.id === "m1")?.filename, "birthday.png");
  assert.equal(renamed.find((item) => item.id === "m1")?.folderId, "f-inflata");
  const missing = applyRenamedMedia(
    items.filter((item) => item.id !== "m1"),
    { ...inflata, filename: "birthday.png" },
  );
  assert.equal(missing.some((item) => item.id === "m1"), true);
});

test("bulk move updates folder ids and file counts immediately", () => {
  const folders = [
    { id: "f-inflata", name: "InflataPark", fileCount: 1 },
    { id: "f-office", name: "Rajan Office", fileCount: 1 },
  ];
  const moved = applyMovedMediaBulk(items, folders, ["m1", "m3"], "f-office", "Rajan Office");
  assert.equal(moved.media.find((item) => item.id === "m1")?.folderId, "f-office");
  assert.equal(moved.media.find((item) => item.id === "m3")?.folderId, "f-office");
  assert.equal(moved.folders.find((folder) => folder.id === "f-inflata")?.fileCount, 0);
  assert.equal(moved.folders.find((folder) => folder.id === "f-office")?.fileCount, 3);
});
