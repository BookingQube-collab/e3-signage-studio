export const MAX_BULK_MEDIA_IDS = 100;

export type MediaUsage = {
  playlists: string[];
  campaigns?: string[];
  screens?: string[];
};

export type PlaylistUsageRow = {
  id?: string;
  name?: string;
  status?: string | null;
  archived_at?: string | null;
};

/**
 * Live usage is any playlist still in the library (draft/active/scheduled).
 * Archived or soft-deleted playlists must not block media delete.
 */
export function isLivePlaylistStatus(
  status: string | null | undefined,
  archivedAt: string | null | undefined,
): boolean {
  if (typeof archivedAt === "string" && archivedAt.length > 0) return false;
  return (status ?? "").toUpperCase() !== "ARCHIVED";
}

export function liveUsagePlaylistNames(playlists: PlaylistUsageRow[]): string[] {
  const names: string[] = [];
  for (const playlist of playlists) {
    if (!isLivePlaylistStatus(playlist.status, playlist.archived_at)) continue;
    if (playlist.name && !names.includes(playlist.name)) names.push(playlist.name);
  }
  return names;
}

export function liveUsagePlaylistIds(playlists: PlaylistUsageRow[]): Set<string> {
  const ids = new Set<string>();
  for (const playlist of playlists) {
    if (!playlist.id) continue;
    if (!isLivePlaylistStatus(playlist.status, playlist.archived_at)) continue;
    ids.add(playlist.id);
  }
  return ids;
}

export type ClickModifiers = {
  toggle: boolean;
  range: boolean;
};

export function selectionCountLabel(count: number): string {
  return count === 1 ? "1 selected" : `${count} selected`;
}

export function idsBetween(orderedIds: string[], fromId: string, toId: string): string[] {
  const from = orderedIds.indexOf(fromId);
  const to = orderedIds.indexOf(toId);
  if (from < 0 && to < 0) return [];
  if (from < 0) return [toId];
  if (to < 0) return [fromId];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return orderedIds.slice(start, end + 1);
}

export function applySelectionClick(
  selected: ReadonlySet<string>,
  orderedIds: string[],
  clickedId: string,
  mods: ClickModifiers,
  anchorId: string | null,
): { selected: Set<string>; anchorId: string | null } {
  if (mods.range && anchorId) {
    const range = idsBetween(orderedIds, anchorId, clickedId);
    if (mods.toggle) {
      const next = new Set(selected);
      for (const id of range) next.add(id);
      return { selected: next, anchorId };
    }
    return { selected: new Set(range), anchorId };
  }

  const next = new Set(selected);
  if (next.has(clickedId)) next.delete(clickedId);
  else next.add(clickedId);
  return { selected: next, anchorId: clickedId };
}

export function selectAllIds(orderedIds: string[]): Set<string> {
  return new Set(orderedIds);
}

export function toggleSelectAll(allSelected: boolean, orderedIds: string[]): Set<string> {
  return allSelected ? new Set() : selectAllIds(orderedIds);
}

export function selectAllActionLabel(allSelected: boolean): string {
  return allSelected ? "Deselect all" : "Select all";
}

export function unionIds(current: ReadonlySet<string>, ids: Iterable<string>): Set<string> {
  const next = new Set(current);
  for (const id of ids) next.add(id);
  return next;
}

export function withoutIds(current: ReadonlySet<string>, ids: Iterable<string>): Set<string> {
  const remove = new Set(ids);
  const next = new Set<string>();
  for (const id of current) {
    if (!remove.has(id)) next.add(id);
  }
  return next;
}

/** Drop IDs that a refetch already omitted so a later stale payload can stay hidden. */
export function releaseHiddenIfGone<T extends { id: string }>(
  hidden: ReadonlySet<string>,
  items: T[],
  candidateIds: Iterable<string>,
): Set<string> {
  const present = new Set(items.map((item) => item.id));
  const next = new Set(hidden);
  for (const id of candidateIds) {
    if (!present.has(id)) next.delete(id);
  }
  return next;
}

export function applyBulkFolderMove<
  T extends { id: string; folderId: string | null; folderName?: string | null },
>(items: T[], ids: Iterable<string>, folderId: string | null, folderName: string | null): T[] {
  const set = new Set(ids);
  return items.map((item) => (set.has(item.id) ? { ...item, folderId, folderName } : item));
}

export function uniquePlaylistNames<T extends { usedIn: MediaUsage }>(items: T[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    for (const name of item.usedIn.playlists) {
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

export function partitionBulkDelete<T extends { id: string; filename: string; usedIn: MediaUsage }>(
  items: T[],
  selectedIds: Iterable<string>,
): { deletable: T[]; blocked: T[]; playlistNames: string[] } {
  const set = new Set(selectedIds);
  const selected = items.filter((item) => set.has(item.id));
  const deletable = selected.filter((item) => item.usedIn.playlists.length === 0);
  const blocked = selected.filter((item) => item.usedIn.playlists.length > 0);
  return { deletable, blocked, playlistNames: uniquePlaylistNames(blocked) };
}

export function inUseDeleteMessage(
  blocked: Array<{ filename: string; usedIn: MediaUsage }>,
): string {
  if (blocked.length === 0) return "";
  const files = blocked.map((item) => item.filename).join(", ");
  const playlists = uniquePlaylistNames(blocked);
  const list = playlists.length > 0 ? playlists.join(", ") : "a playlist";
  return `Cannot delete ${files}. Used in live playlist${playlists.length === 1 ? "" : "s"}: ${list}. Remove ${
    blocked.length === 1 ? "it" : "them"
  } from those playlists or archive instead — deleting would take the files off the live screens.`;
}

export function assertBulkDeleteAllowed(
  blocked: Array<{ filename: string; usedIn: MediaUsage }>,
): void {
  if (blocked.length === 0) return;
  throw new Error(inUseDeleteMessage(blocked));
}

export function applyBulkDelete<T extends { id: string }>(items: T[], ids: Iterable<string>): T[] {
  const set = new Set(ids);
  return items.filter((item) => !set.has(item.id));
}
