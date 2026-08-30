import { firstHttpUrl } from "./playlist-preview.ts";

/** Library list omits video download URLs; a still needs a signed poster or preview. */
export function videoStillNeedsHydration(input: {
  type?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
}): boolean {
  if (input.type !== "Video") return false;
  return !firstHttpUrl(input.thumbnailUrl, input.previewUrl);
}

/** Playback needs the signed file URL — a poster still is not enough. */
export function videoPreviewNeedsHydration(input: {
  type?: string | null;
  previewUrl?: string | null;
}): boolean {
  if (input.type !== "Video") return false;
  return !firstHttpUrl(input.previewUrl);
}

/** True when the URL is a still image (not an mp4 blob/file used as a poster fallback). */
export function isImageStillUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(avif|bmp|gif|jpe?g|png|webp)(\?|#|$)/i.test(url.split("?")[0] ?? url);
}

/** Prefer ~2.5s into the clip so stills skip black/empty intros (clamped to duration). */
export const VIDEO_STILL_SEEK_SECONDS = 2.5;

/** Seek a paused video far enough to paint a useful frame without calling play(). */
export function seekVideoToStillFrame(video: {
  readyState: number;
  duration: number;
  currentTime: number;
  pause: () => void;
}): void {
  if (video.readyState < 1) return;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  // ~2.5s into the clip; short videos land just before the end.
  const target =
    duration > 0
      ? Math.min(VIDEO_STILL_SEEK_SECONDS, Math.max(0.05, duration - 0.05))
      : VIDEO_STILL_SEEK_SECONDS;
  if (Math.abs(video.currentTime - target) < 0.08) return;
  try {
    video.pause();
    video.currentTime = target;
  } catch {
    // Some browsers reject seeks before they have enough bytes.
  }
}
