export const MAX_FOLDER_NAME = 80;

export const FOLDER_DUPLICATE_MESSAGE = "A folder with that name already exists.";

export type LibraryView =
  | { mode: "search"; query: string }
  | { mode: "folder"; folderId: string }
  | { mode: "root" };

export function normalizeFolderName(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

export function assertFolderName(name: string): string {
  const normalized = normalizeFolderName(name);
  if (!normalized) throw new Error("Folder name is required.");
  if (normalized.length > MAX_FOLDER_NAME) {
    throw new Error(`Folder name must be ${MAX_FOLDER_NAME} characters or fewer.`);
  }
  return normalized;
}

export function folderNameKey(name: string): string {
  return normalizeFolderName(name).toLowerCase();
}

export function isDuplicateFolderName(existingNames: string[], name: string): boolean {
  const needle = folderNameKey(name);
  if (!needle) return false;
  return existingNames.some((value) => folderNameKey(value) === needle);
}

export type FolderArchiveFields = {
  archivedAt?: string | null;
  status?: string;
};

export function isArchivedFolder(folder: FolderArchiveFields): boolean {
  if (typeof folder.archivedAt === "string" && folder.archivedAt.length > 0) return true;
  return (folder.status ?? "").toUpperCase() === "ARCHIVED";
}

export function liveFolders<T extends FolderArchiveFields>(folders: T[]): T[] {
  return folders.filter((folder) => !isArchivedFolder(folder));
}

export function findFolderByName<T extends { name: string }>(folders: T[], name: string): T | undefined {
  const needle = folderNameKey(name);
  if (!needle) return undefined;
  return folders.find((folder) => folderNameKey(folder.name) === needle);
}

/** One live card per name. Archived rows must not reappear as library folders. */
export function uniqueFoldersByName<
  T extends { id: string; name: string; fileCount?: number } & FolderArchiveFields,
>(folders: T[]): T[] {
  const seen = new Map<string, T>();
  for (const folder of liveFolders(folders)) {
    const key = folderNameKey(folder.name);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, folder);
      continue;
    }
    const existingCount = existing.fileCount ?? 0;
    const nextCount = folder.fileCount ?? 0;
    if (nextCount > existingCount) seen.set(key, folder);
  }
  return [...seen.values()];
}

export function upsertFolder<T extends { id: string; name: string } & FolderArchiveFields>(
  folders: T[],
  folder: T,
): T[] {
  if (isArchivedFolder(folder)) {
    return liveFolders(folders).filter((item) => item.id !== folder.id);
  }
  const key = folderNameKey(folder.name);
  const without = liveFolders(folders).filter(
    (item) => item.id !== folder.id && folderNameKey(item.name) !== key,
  );
  return [...without, folder].sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeLibraryMedia<T extends { id: string }>(current: T[], added: T[]): T[] {
  if (added.length === 0) return current;
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of added) byId.set(item.id, item);
  return [...byId.values()];
}

export function bumpFolderFileCount<T extends { id: string; fileCount: number }>(
  folders: T[],
  folderId: string | null | undefined,
  delta: number,
): T[] {
  if (!folderId || delta === 0) return folders;
  return folders.map((folder) =>
    folder.id === folderId ? { ...folder, fileCount: Math.max(0, folder.fileCount + delta) } : folder,
  );
}

export function applyUploadedMedia<
  TMedia extends { id: string; folderId: string | null },
  TFolder extends { id: string; fileCount: number },
>(
  media: TMedia[],
  folders: TFolder[],
  added: TMedia[],
): { media: TMedia[]; folders: TFolder[] } {
  const existingIds = new Set(media.map((item) => item.id));
  const merged = mergeLibraryMedia(media, added);
  const counts = new Map<string, number>();
  for (const item of added) {
    if (!item.folderId || existingIds.has(item.id)) continue;
    counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1);
  }
  let nextFolders = folders;
  for (const [id, delta] of counts) {
    nextFolders = bumpFolderFileCount(nextFolders, id, delta);
  }
  return { media: merged, folders: nextFolders };
}

/** Reuse a live folder with the same name. Archived folders stay gone. */
export function resolveFolderCreate<T extends { id: string; name: string } & FolderArchiveFields>(
  existing: T[],
  name: string,
  newId: string,
): { folder: { id: string; name: string }; reused: boolean } {
  const normalized = assertFolderName(name);
  const found = findFolderByName(liveFolders(existing), normalized);
  if (found) return { folder: { id: found.id, name: found.name }, reused: true };
  return { folder: { id: newId, name: normalized }, reused: false };
}

export function folderDeleteCopy(
  folderName: string,
  fileCount: number,
): { title: string; description: string; detail: string | null; confirmLabel: string } {
  const title = `Delete ${folderName}?`;
  if (fileCount <= 0) {
    return {
      title,
      description: "This cannot be undone.",
      detail: null,
      confirmLabel: "Delete folder",
    };
  }
  const files = fileCount === 1 ? "1 file" : `${fileCount} files`;
  return {
    title,
    description: `This deletes the folder and ${files} inside. This cannot be undone.`,
    detail: `${folderName} has ${files}. They will be removed from the library with the folder.`,
    confirmLabel: `Delete folder and ${files}`,
  };
}

export function applyFolderCascadeDelete<
  TMedia extends { id: string; folderId: string | null },
  TFolder extends { id: string },
>(
  media: TMedia[],
  folders: TFolder[],
  folderId: string,
): { media: TMedia[]; folders: TFolder[] } {
  return {
    media: media.filter((item) => item.folderId !== folderId),
    folders: folders.filter((folder) => folder.id !== folderId),
  };
}

export function resolveUploadFolderId(currentFolderId: string | null | undefined): string | null {
  return currentFolderId ?? null;
}

export function libraryViewFor(search: string, folderId: string | null): LibraryView {
  const query = search.trim();
  if (query) return { mode: "search", query };
  if (folderId) return { mode: "folder", folderId };
  return { mode: "root" };
}

export function mediaInLibraryView<T extends { filename: string; folderId: string | null }>(
  items: T[],
  view: LibraryView,
): T[] {
  if (view.mode === "search") {
    const q = view.query.toLowerCase();
    return items.filter((item) => item.filename.toLowerCase().includes(q));
  }
  if (view.mode === "folder") {
    return items.filter((item) => item.folderId === view.folderId);
  }
  return items.filter((item) => item.folderId == null);
}

export function foldersInLibraryView<T extends { name: string }>(
  folders: T[],
  view: LibraryView,
): T[] {
  if (view.mode === "folder") return [];
  if (view.mode === "search") {
    const q = view.query.toLowerCase();
    return folders.filter((folder) => folder.name.toLowerCase().includes(q));
  }
  return folders;
}

export function folderCardLabel(folderName: string | null | undefined, searching: boolean): string | null {
  if (searching) return folderName?.trim() ? folderName : "Unfiled";
  return folderName?.trim() ? folderName : null;
}

export function countFilesInFolder<T extends { folderId: string | null }>(
  items: T[],
  folderId: string,
): number {
  return items.filter((item) => item.folderId === folderId).length;
}

export function applyFolderMove<T extends { id: string; folderId: string | null; folderName?: string | null }>(
  items: T[],
  mediaId: string,
  folderId: string | null,
  folderName: string | null,
): T[] {
  return items.map((item) =>
    item.id === mediaId ? { ...item, folderId, folderName } : item,
  );
}

export function createFolderRecord(
  existingNames: string[],
  name: string,
  id: string,
): { id: string; name: string } {
  const normalized = assertFolderName(name);
  if (isDuplicateFolderName(existingNames, normalized)) {
    throw new Error(FOLDER_DUPLICATE_MESSAGE);
  }
  return { id, name: normalized };
}
