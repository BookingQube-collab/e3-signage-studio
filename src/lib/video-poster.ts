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

/** True when the URL is a still image (not an mp4 blob/file used as a poster fallback). */
export function isImageStillUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(avif|bmp|gif|jpe?g|png|webp)(\?|#|$)/i.test(url.split("?")[0] ?? url);
}

/** Seek a paused video far enough to paint a frame without calling play(). */
export function seekVideoToStillFrame(video: {
  readyState: number;
  duration: number;
  currentTime: number;
  pause: () => void;
}): void {
  if (video.readyState < 1) return;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const target = duration > 0 ? Math.min(0.25, Math.max(0.05, duration * 0.02)) : 0.1;
  if (Math.abs(video.currentTime - target) < 0.04) return;
  try {
    video.pause();
    video.currentTime = target;
  } catch {
    // Some browsers reject seeks before they have enough bytes.
  }
}
