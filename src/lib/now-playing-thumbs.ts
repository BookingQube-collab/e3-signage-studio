import type { Screen } from "../types/index.ts";

/** Merge second-pass signed stills onto screen rows without blocking the list query. */
export function withNowPlayingThumbnails(
  screens: Screen[],
  thumbs: Record<string, string | null> | undefined,
): Screen[] {
  if (!thumbs || Object.keys(thumbs).length === 0) return screens;
  return screens.map((screen) => {
    const mediaId = screen.nowPlayingMediaId;
    if (!mediaId || !(mediaId in thumbs)) return screen;
    const url = thumbs[mediaId] ?? null;
    if (url === screen.nowPlayingThumbnailUrl) return screen;
    return { ...screen, nowPlayingThumbnailUrl: url, nowPlayingPreviewUrl: null };
  });
}

export function uniqueNowPlayingMediaIds(screens: Screen[]): string[] {
  const ids = new Set<string>();
  for (const screen of screens) {
    if (screen.nowPlayingMediaId) ids.add(screen.nowPlayingMediaId);
  }
  return [...ids].sort();
}
