/** Bind live playlist items to frozen (or live) package assets. */

export type PlaylistSnapshotItem = {
  mediaId: string;
  mediaVersionId: string;
  durationSeconds: number;
  transition: string;
};

export type BoundPlaylistItem = PlaylistSnapshotItem & {
  localFilename: string;
};

/** Map each playlist item to a local filename. Missing assets are dropped — they never reach the player. */
export function bindPlaylistItemsToAssets(
  items: PlaylistSnapshotItem[],
  localFilenameByVersionId: Map<string, string>,
  localFilenameByMediaId: Map<string, string> = new Map(),
): BoundPlaylistItem[] {
  const bound: BoundPlaylistItem[] = [];
  for (const item of items) {
    const localFilename =
      localFilenameByVersionId.get(item.mediaVersionId) ?? localFilenameByMediaId.get(item.mediaId);
    if (!localFilename) continue;
    bound.push({
      mediaId: item.mediaId,
      mediaVersionId: item.mediaVersionId,
      durationSeconds: Math.max(0.1, item.durationSeconds),
      transition: item.transition,
      localFilename,
    });
  }
  return bound;
}

/** True when the live playlist/layout references a version the frozen snapshot does not ship. */
export function isPlaylistSnapshotStale(
  liveVersionIds: string[],
  frozenVersionIds: Iterable<string>,
): boolean {
  const frozen = new Set([...frozenVersionIds].filter(Boolean));
  return liveVersionIds.some((id) => Boolean(id) && !frozen.has(id));
}
