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
 * Non-archived library playlists (draft/active/scheduled).
 * Archived or soft-deleted playlists must not block media delete.
 */
export function isLivePlaylistStatus(
  status: string | null | undefined,
  archivedAt: string | null | undefined,
): boolean {
  if (typeof archivedAt === "string" && archivedAt.length > 0) return false;
  return (status ?? "").toUpperCase() !== "ARCHIVED";
}

/**
 * Media delete is blocked only when a non-archived playlist still holds the file
 * AND that playlist is assigned to a screen or a non-archived campaign.
 * Orphan draft/active playlists in the library alone must not block delete.
 */
export function blockingLivePlaylistIds(
  playlists: PlaylistUsageRow[],
  linkedPlaylistIds: Iterable<string>,
): Set<string> {
  const linked = new Set(
    [...linkedPlaylistIds].filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const ids = new Set<string>();
  for (const playlist of playlists) {
    if (!playlist.id) continue;
    if (!isLivePlaylistStatus(playlist.status, playlist.archived_at)) continue;
    if (!linked.has(playlist.id)) continue;
    ids.add(playlist.id);
  }
  return ids;
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

export function sameIdSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
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

/** Keep the same Set instance when nothing was released so React effects can bail out. */
export function pruneHiddenIds<T extends { id: string }>(
  hidden: Set<string>,
  items: T[],
): Set<string> {
  const next = releaseHiddenIfGone(hidden, items, hidden);
  return sameIdSet(hidden, next) ? hidden : next;
}

export function applyBulkFolderMove<
  T extends { id: string; folderId: string | null; folderName?: string | null },
>(items: T[], ids: Iterable<string>, folderId: string | null, folderName: string | null): T[] {
  const set = new Set(ids);
  return items.map((item) => (set.has(item.id) ? { ...item, folderId, folderName } : item));
}

export function uniquePlaylistNames<T extends { usedIn?: MediaUsage | null }>(items: T[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    for (const name of item.usedIn?.playlists ?? []) {
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

export type MediaStorageBackend = "r2" | "supabase";

/**
 * CMS delete purges object storage by default. Pass `false` only to keep
 * the R2/storage object (library row still removed).
 */
export function shouldDeleteFromStorage(flag: boolean | null | undefined): boolean {
  return flag !== false;
}

/**
 * Confirm-dialog copy for optionally keeping Cloudflare R2 / Supabase Storage
 * objects after removing library rows (hard-delete is the default).
 */
export function mediaStorageDeleteCopy(backend: MediaStorageBackend = "r2"): {
  checkboxLabel: string;
  checkedHint: string;
  uncheckedHint: string;
} {
  if (backend === "supabase") {
    return {
      checkboxLabel: "Also delete from storage?",
      checkedHint: "Permanently removes the object(s) from storage. This cannot be undone.",
      uncheckedHint: "Removes library records only. Objects stay in storage.",
    };
  }
  return {
    checkboxLabel: "Also delete from Cloudflare?",
    checkedHint: "Permanently removes the object(s) from Cloudflare R2. This cannot be undone.",
    uncheckedHint: "Removes library records only. Objects stay in Cloudflare R2.",
  };
}

export function partitionBulkDelete<T extends { id: string; filename: string; usedIn?: MediaUsage | null }>(
  items: T[],
  selectedIds: Iterable<string>,
): { deletable: T[]; blocked: T[]; playlistNames: string[] } {
  const set = new Set(selectedIds);
  const selected = items.filter((item) => set.has(item.id));
  const deletable = selected.filter((item) => (item.usedIn?.playlists ?? []).length === 0);
  const blocked = selected.filter((item) => (item.usedIn?.playlists ?? []).length > 0);
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
