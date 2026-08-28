import type { Media, MediaType, PlaylistItem, Transition } from "@/types";

/** Enter-transition length. Keep in sync with TV `ITEM_TRANSITION_MS`. */
export const PREVIEW_FADE_MS = 800;

export type PreviewLayerStyle = {
  opacity?: string;
  transform?: string;
  filter?: string;
  clipPath?: string;
};

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
  prevIndex: number;
  clipElapsedMs: number;
  /** 0 = previous fully visible, 1 = current fully visible. */
  progress: number;
  effect: Transition;
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

export function asTransition(value: string): Transition {
  switch (value.trim().toLowerCase().replace(/_/g, " ")) {
    case "cut":
      return "Cut";
    case "none":
      return "None";
    case "dissolve":
      return "Dissolve";
    case "slide":
    case "slide left":
      return "Slide";
    case "slide right":
      return "Slide right";
    case "slide up":
      return "Slide up";
    case "slide down":
      return "Slide down";
    case "zoom":
      return "Zoom";
    case "wipe":
      return "Wipe";
    default:
      return "Fade";
  }
}

export function isInstantTransition(effect: Transition): boolean {
  return effect === "Cut" || effect === "None";
}

function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

function isSlide(effect: Transition): boolean {
  return effect === "Slide" || effect === "Slide right" || effect === "Slide up" || effect === "Slide down";
}

/** CSS for compositing previous/current layers. Progress is 0 (previous) → 1 (current). */
export function previewLayerStyle(
  role: "current" | "previous",
  effect: Transition,
  progress: number,
): PreviewLayerStyle {
  const p = Math.min(1, Math.max(0, progress));
  const t = isSlide(effect) ? easeOutCubic(p) : p;
  const incoming = role === "current";

  if (isInstantTransition(effect)) {
    return { opacity: incoming ? "1" : "0" };
  }

  if (effect === "Fade") {
    return { opacity: String(incoming ? t : 1 - t) };
  }

  if (effect === "Dissolve") {
    const blur = incoming ? (1 - t) * 8 : t * 6;
    return { opacity: String(incoming ? t : 1 - t), filter: `blur(${blur}px)` };
  }

  if (effect === "Zoom") {
    const scale = incoming ? 0.78 + 0.22 * t : 1 + 0.14 * t;
    return { opacity: String(incoming ? t : 1 - t), transform: `scale(${scale})` };
  }

  if (effect === "Wipe") {
    if (incoming) return { opacity: "1", clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` };
    return { opacity: "1" };
  }

  if (effect === "Slide") {
    const x = incoming ? (1 - t) * 100 : -t * 100;
    return { opacity: "1", transform: `translateX(${x}%)` };
  }
  if (effect === "Slide right") {
    const x = incoming ? (t - 1) * 100 : t * 100;
    return { opacity: "1", transform: `translateX(${x}%)` };
  }
  if (effect === "Slide up") {
    const y = incoming ? (1 - t) * 100 : -t * 100;
    return { opacity: "1", transform: `translateY(${y}%)` };
  }
  if (effect === "Slide down") {
    const y = incoming ? (t - 1) * 100 : t * 100;
    return { opacity: "1", transform: `translateY(${y}%)` };
  }

  return { opacity: String(incoming ? t : 1 - t) };
}

export function mediaPreviewKind(type: string): "image" | "video" {
  return type === "Video" || type === "VIDEO" ? "video" : "image";
}

/** Browser-playable URLs only — storage keys 404 as relative paths. */
export function httpMediaUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^blob:/i.test(trimmed)) return trimmed;
  return null;
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
    // Prefer playlist/item signed URLs first so library list can skip video signing.
    const previewUrl =
      kind === "video"
        ? firstHttpUrl(item.previewUrl, media?.previewUrl)
        : firstHttpUrl(item.previewUrl, item.thumbnailUrl, media?.previewUrl, media?.thumbnailUrl);
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
  const previewUrl =
    firstHttpUrl(library?.previewUrl, clip?.previewUrl, item.previewUrl, thumbnailUrl) ?? undefined;
  if (library) {
    return {
      ...library,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    };
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
  if (previewUrl) media.previewUrl = previewUrl;
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
  if (total <= 0) {
    return {
      index: 0,
      nextIndex: 0,
      prevIndex: 0,
      clipElapsedMs: 0,
      progress: 1,
      effect: "Cut",
    };
  }

  const t = loop
    ? ((elapsedMs % total) + total) % total
    : Math.min(Math.max(0, elapsedMs), total - 1);

  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const duration = durations[i] ?? 1000;
    if (t < acc + duration) {
      return frameForIndex(items, durations, i, t - acc, elapsedMs, loop);
    }
    acc += duration;
  }

  const last = items.length - 1;
  return frameForIndex(items, durations, last, 0, elapsedMs, loop);
}

function frameForIndex(
  items: Array<{ durationSec: number; transition: string }>,
  durations: number[],
  index: number,
  clipElapsedMs: number,
  _elapsedMs: number,
  loop: boolean,
): PreviewFrame {
  const nextIndex = index + 1 < items.length ? index + 1 : loop ? 0 : index;
  const prevIndex = index > 0 ? index - 1 : loop ? items.length - 1 : index;
  const effect = asTransition(items[index]?.transition ?? "Fade");
  const duration = durations[index] ?? 1000;
  const windowMs = Math.min(PREVIEW_FADE_MS, duration);
  const hasPrev = prevIndex !== index;
  const canEnter = hasPrev && !isInstantTransition(effect) && windowMs > 0;
  const progress = canEnter ? Math.min(1, Math.max(0, clipElapsedMs / windowMs)) : 1;
  return {
    index,
    nextIndex,
    prevIndex,
    clipElapsedMs,
    progress,
    effect,
  };
}

export function clipLabel(type: MediaType | string, filename: string): string {
  return filename || (mediaPreviewKind(String(type)) === "video" ? "Video" : "Image");
}
