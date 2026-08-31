import { firstHttpUrl } from "./playlist-preview.ts";

/** Library list omits video download URLs; image posters are enough for grid stills. */
export function videoStillNeedsHydration(input: {
  type?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
}): boolean {
  void input.thumbnailUrl;
  void input.previewUrl;
  // Never fetch a signed MP4 just to paint a card — that hung Screens/Media with large files.
  // Detail modals hydrate playback URLs separately. Image posters already on the row are enough.
  return false;
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

/** Muted card preview plays this many seconds then restarts (skips long downloads via seek). */
export const VIDEO_CLIP_LOOP_SECONDS = 3;

/** Inclusive start/end for a short muted preview window on screen cards. */
export function videoClipLoopWindow(duration: number): { start: number; end: number } {
  const safe = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (safe <= 0) {
    return { start: 0, end: VIDEO_CLIP_LOOP_SECONDS };
  }
  if (safe <= VIDEO_CLIP_LOOP_SECONDS) {
    return { start: 0, end: Math.max(0.05, safe - 0.05) };
  }
  const start = Math.min(VIDEO_STILL_SEEK_SECONDS, safe - VIDEO_CLIP_LOOP_SECONDS);
  return { start, end: start + VIDEO_CLIP_LOOP_SECONDS };
}

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

/** Seek to the start of the short preview window (used before autoplay / on loop wrap). */
export function seekVideoToClipLoopStart(video: {
  readyState: number;
  duration: number;
  currentTime: number;
}): void {
  if (video.readyState < 1) return;
  const { start } = videoClipLoopWindow(video.duration);
  if (Math.abs(video.currentTime - start) < 0.05) return;
  try {
    video.currentTime = start;
  } catch {
    // Some browsers reject seeks before they have enough bytes.
  }
}
