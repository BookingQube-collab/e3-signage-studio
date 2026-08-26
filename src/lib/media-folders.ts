export const MAX_FOLDER_NAME = 80;

export const FOLDER_NOT_EMPTY_MESSAGE =
  "This folder still has files. Move them to another folder or Unfiled first.";

export const FOLDER_DUPLICATE_MESSAGE = "A folder with that name already exists.";

export type LibraryView =
  | { mode: "search"; query: string }
  | { mode: "folder"; folderId: string }
  | { mode: "root" };

export function normalizeFolderName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function assertFolderName(name: string): string {
  const normalized = normalizeFolderName(name);
  if (!normalized) throw new Error("Folder name is required.");
  if (normalized.length > MAX_FOLDER_NAME) {
    throw new Error(`Folder name must be ${MAX_FOLDER_NAME} characters or fewer.`);
  }
  return normalized;
}

export function isDuplicateFolderName(existingNames: string[], name: string): boolean {
  const needle = normalizeFolderName(name).toLowerCase();
  if (!needle) return false;
  return existingNames.some((value) => normalizeFolderName(value).toLowerCase() === needle);
}

export function assertFolderDeletable(visibleFileCount: number): void {
  if (visibleFileCount > 0) throw new Error(FOLDER_NOT_EMPTY_MESSAGE);
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
