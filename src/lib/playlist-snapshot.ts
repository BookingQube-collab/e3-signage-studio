/** Bind live playlist items to frozen (or live) package assets. */

export type PlaylistSnapshotItem = {
  mediaId: string;
  mediaVersionId: string;
  durationSeconds: number;
  transition: string;
  audioMediaId?: string | null;
  audioMediaVersionId?: string | null;
};

export type BoundPlaylistItem = PlaylistSnapshotItem & {
  localFilename: string;
  audioLocalFilename?: string | null;
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
    const audioLocalFilename =
      (item.audioMediaVersionId
        ? localFilenameByVersionId.get(item.audioMediaVersionId)
        : undefined) ??
      (item.audioMediaId ? localFilenameByMediaId.get(item.audioMediaId) : undefined) ??
      null;
    bound.push({
      mediaId: item.mediaId,
      mediaVersionId: item.mediaVersionId,
      durationSeconds: Math.max(0.1, item.durationSeconds),
      transition: item.transition,
      localFilename,
      ...(item.audioMediaId ? { audioMediaId: item.audioMediaId } : {}),
      ...(item.audioMediaVersionId ? { audioMediaVersionId: item.audioMediaVersionId } : {}),
      ...(audioLocalFilename ? { audioLocalFilename } : {}),
    });
  }
  return bound;
}

/**
 * Stable key for playlist playback order + timing + transitions.
 * Used to detect reorder/transition-only edits that do not change asset version IDs.
 */
export function playlistSequenceFingerprint(
  items: Array<
    Pick<PlaylistSnapshotItem, "mediaVersionId" | "durationSeconds" | "transition" | "audioMediaVersionId">
  >,
): string {
  return items
    .map((item) => {
      const duration = Math.max(0.1, Number(item.durationSeconds) || 0);
      const transition = String(item.transition ?? "FADE").trim().toUpperCase() || "FADE";
      const audio = item.audioMediaVersionId ? `:${item.audioMediaVersionId}` : "";
      return `${item.mediaVersionId}:${duration}:${transition}${audio}`;
    })
    .join("|");
}

/** True when live order/duration/transition differs from the frozen package sequence. */
export function isPlaylistSequenceStale(
  liveItems: Array<
    Pick<PlaylistSnapshotItem, "mediaVersionId" | "durationSeconds" | "transition" | "audioMediaVersionId">
  >,
  frozenItems: Array<
    Pick<PlaylistSnapshotItem, "mediaVersionId" | "durationSeconds" | "transition" | "audioMediaVersionId">
  >,
): boolean {
  return playlistSequenceFingerprint(liveItems) !== playlistSequenceFingerprint(frozenItems);
}

/** True when the live playlist/layout references a version the frozen snapshot does not ship. */
export function isPlaylistSnapshotStale(
  liveVersionIds: string[],
  frozenVersionIds: Iterable<string>,
): boolean {
  const frozen = new Set([...frozenVersionIds].filter(Boolean));
  return liveVersionIds.some((id) => Boolean(id) && !frozen.has(id));
}
