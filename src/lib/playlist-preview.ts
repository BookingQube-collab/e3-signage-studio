import type { Media, MediaType, PlaylistItem, Transition } from "@/types";

export const PREVIEW_FADE_MS = 500;

export type PreviewClip = {
  id: string;
  mediaId: string;
  filename: string;
  kind: "image" | "video";
  durationSec: number;
  transition: Transition;
  previewUrl: string | null;
  thumbnailUrl: string | null;
};

export type PreviewFrame = {
  index: number;
  nextIndex: number;
  clipElapsedMs: number;
  fadeT: number;
};

export type PreviewMediaLookup = {
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
};

type PreviewItem = Pick<PlaylistItem, "id" | "mediaId" | "filename" | "type" | "durationSec" | "transition"> & {
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
};

function asTransition(value: string): Transition {
  if (value === "Cut" || value === "Slide") return value;
  return "Fade";
}

export function mediaPreviewKind(type: string): "image" | "video" {
  return type === "Video" || type === "VIDEO" ? "video" : "image";
}

/** Only pass browser-fetchable URLs to <img>/<video> — storage keys 404 as relative paths. */
export function httpMediaUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function firstHttpUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const url = httpMediaUrl(value);
    if (url) return url;
  }
  return null;
}

export function bindPreviewClips(
  items: PreviewItem[],
  mediaById: Map<string, PreviewMediaLookup>,
): PreviewClip[] {
  return items.map((item) => {
    const media = mediaById.get(item.mediaId);
    const kind = mediaPreviewKind(media?.type ?? item.type);
    const thumbnailUrl = firstHttpUrl(
      media?.thumbnailUrl,
      item.thumbnailUrl,
      kind === "image" ? media?.previewUrl : null,
      kind === "image" ? item.previewUrl : null,
    );
    const previewUrl =
      kind === "video"
        ? firstHttpUrl(media?.previewUrl, item.previewUrl)
        : firstHttpUrl(media?.previewUrl, media?.thumbnailUrl, item.previewUrl, item.thumbnailUrl);
    return {
      id: item.id,
      mediaId: item.mediaId,
      filename: item.filename,
      kind,
      durationSec: Math.max(1, item.durationSec),
      transition: asTransition(item.transition),
      previewUrl,
      thumbnailUrl: thumbnailUrl ?? (kind === "image" ? previewUrl : null),
    };
  });
}

export function playlistItemThumbMedia(
  item: PreviewItem,
  library?: Media | null,
  clip?: Pick<PreviewClip, "thumbnailUrl" | "previewUrl">,
): Media {
  const thumbnailUrl =
    firstHttpUrl(
      library?.thumbnailUrl,
      clip?.thumbnailUrl,
      item.thumbnailUrl,
      library?.previewUrl,
      clip?.previewUrl,
      item.previewUrl,
    ) ?? undefined;
  if (library) {
    return thumbnailUrl ? { ...library, thumbnailUrl } : library;
  }
  const media: Media = {
    id: item.mediaId,
    filename: item.filename,
    type: item.type,
    dimensions: "",
    durationSec: item.durationSec,
    sizeMb: 0,
    modifiedAt: "",
    uploadedBy: "",
    uploadedAt: "",
    version: "v1",
    thumbnailHue: 270,
    folderId: null,
    folderName: null,
    usedIn: { playlists: [], campaigns: [], screens: [] },
  };
  if (thumbnailUrl) media.thumbnailUrl = thumbnailUrl;
  return media;
}

export function elapsedOffsetForMedia(items: Array<{ mediaId: string; durationSec: number }>, mediaId: string | null | undefined): number {
  if (!mediaId) return 0;
  let acc = 0;
  for (const item of items) {
    if (item.mediaId === mediaId) return acc;
    acc += Math.max(1, item.durationSec) * 1000;
  }
  return 0;
}

export function previewFrameAt(
  items: Array<{ durationSec: number; transition: string }>,
  elapsedMs: number,
  loop = true,
): PreviewFrame | null {
  if (items.length === 0) return null;
  const durations = items.map((item) => Math.max(1, item.durationSec) * 1000);
  const total = durations.reduce((sum, ms) => sum + ms, 0);
  if (total <= 0) return { index: 0, nextIndex: 0, clipElapsedMs: 0, fadeT: 0 };

  const t = loop
    ? ((elapsedMs % total) + total) % total
    : Math.min(Math.max(0, elapsedMs), total - 1);

  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const duration = durations[i] ?? 1000;
    if (t < acc + duration) {
      const clipElapsedMs = t - acc;
      const remaining = duration - clipElapsedMs;
      const hasNext = loop || i + 1 < items.length;
      const nextIndex = i + 1 < items.length ? i + 1 : loop ? 0 : i;
      const fade =
        asTransition(items[i]?.transition ?? "Fade") === "Fade" &&
        hasNext &&
        nextIndex !== i &&
        remaining <= PREVIEW_FADE_MS;
      const fadeT = fade ? 1 - remaining / PREVIEW_FADE_MS : 0;
      return {
        index: i,
        nextIndex,
        clipElapsedMs,
        fadeT: Math.min(1, Math.max(0, fadeT)),
      };
    }
    acc += duration;
  }

  const last = items.length - 1;
  return { index: last, nextIndex: loop ? 0 : last, clipElapsedMs: 0, fadeT: 0 };
}

export function clipLabel(type: MediaType | string, filename: string): string {
  return filename || (mediaPreviewKind(String(type)) === "video" ? "Video" : "Image");
}
