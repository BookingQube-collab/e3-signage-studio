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
      // One decimal avoids float noise (DB numeric vs JSON) causing perpetual stale republish.
      const duration = Math.round(Math.max(0.1, Number(item.durationSeconds) || 0) * 10) / 10;
      const transition =
        String(item.transition ?? "FADE")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "_") || "FADE";
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

/** Zone placement + content binding frozen into the published package. */
export type LayoutZoneSnapshot = {
  id: string;
  type: string;
  contentRef: string | null;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  fit: string;
  sortOrder: number;
};

/** Stable key for layout zone geometry + content refs. */
export function layoutZonesFingerprint(zones: LayoutZoneSnapshot[]): string {
  return [...zones]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((zone) =>
      [
        zone.id,
        zone.type.trim().toUpperCase(),
        zone.contentRef ?? "",
        Number(zone.xPercent).toFixed(3),
        Number(zone.yPercent).toFixed(3),
        Number(zone.widthPercent).toFixed(3),
        Number(zone.heightPercent).toFixed(3),
        zone.fit.trim().toUpperCase(),
        String(zone.sortOrder),
      ].join(":"),
    )
    .join("|");
}

/** True when live layout zones differ from the frozen package (or older packages omitted zones). */
export function isLayoutZonesStale(
  liveZones: LayoutZoneSnapshot[],
  frozenZones: LayoutZoneSnapshot[],
  opts: { layoutId: string | null; frozenLayoutId: string | null },
): boolean {
  if ((opts.layoutId ?? null) !== (opts.frozenLayoutId ?? null)) return true;
  if (!opts.layoutId) return false;
  if (frozenZones.length === 0) return liveZones.length > 0;
  return layoutZonesFingerprint(liveZones) !== layoutZonesFingerprint(frozenZones);
}
