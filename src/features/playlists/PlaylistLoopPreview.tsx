import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import {
  PREVIEW_FADE_MS,
  previewFrameAt,
  type PreviewClip,
  type PreviewFrame,
} from "@/lib/playlist-preview";

const STAGE_BG =
  "radial-gradient(ellipse at 20% 10%, rgba(141,92,221,.22), transparent 60%), #0f0d11";

function PreviewMedia({
  clip,
  className,
  style,
}: {
  clip: PreviewClip;
  className?: string;
  style?: CSSProperties;
}) {
  if (!clip.previewUrl) {
    return (
      <div className={cn("grid size-full place-items-center bg-black/40", className)} style={style}>
        <p className="max-w-[90%] truncate px-3 text-center text-sm font-medium text-white/80">
          {clip.filename}
        </p>
      </div>
    );
  }
  if (clip.kind === "video") {
    return (
      <video
        key={clip.id}
        src={clip.previewUrl}
        className={cn("size-full object-contain", className)}
        style={style}
        muted
        playsInline
        autoPlay
        loop={false}
      />
    );
  }
  return (
    <img
      src={clip.previewUrl}
      alt=""
      className={cn("size-full object-contain", className)}
      style={style}
    />
  );
}

export function PlaylistLoopPreview({
  clips,
  loop = true,
  className,
  emptyLabel = "Add media to preview",
  startMediaId,
}: {
  clips: PreviewClip[];
  loop?: boolean;
  className?: string;
  emptyLabel?: string;
  startMediaId?: string | null;
}) {
  const originMs = useMemo(() => {
    if (!startMediaId) return 0;
    let acc = 0;
    for (const clip of clips) {
      if (clip.mediaId === startMediaId) return acc;
      acc += Math.max(1, clip.durationSec) * 1000;
    }
    return 0;
  }, [clips, startMediaId]);

  const clipKey = clips
    .map((clip) => `${clip.id}:${clip.durationSec}:${clip.transition}:${clip.previewUrl ?? ""}`)
    .join("|");
  const [startedAt, setStartedAt] = useState(() => Date.now() - originMs);
  const [frame, setFrame] = useState<PreviewFrame | null>(() => previewFrameAt(clips, originMs, loop));

  useEffect(() => {
    setStartedAt(Date.now() - originMs);
  }, [clipKey, originMs]);

  useEffect(() => {
    if (clips.length === 0) {
      setFrame(null);
      return;
    }
    const tick = () => setFrame(previewFrameAt(clips, Date.now() - startedAt, loop));
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [clips, loop, startedAt]);

  const current = frame ? clips[frame.index] : undefined;
  const incoming = frame && frame.fadeT > 0 ? clips[frame.nextIndex] : undefined;

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-border", className)}
      style={{ background: STAGE_BG }}
    >
      <div className="relative aspect-video w-full bg-black">
        {clips.length === 0 || !current ? (
          <div className="grid size-full place-items-center text-center">
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : (
          <>
            <PreviewMedia
              clip={current}
              className="absolute inset-0 transition-opacity"
              style={{
                opacity: incoming ? 1 - frame.fadeT : 1,
                transform:
                  current.transition === "Slide" && incoming
                    ? `translateX(${-12 * frame.fadeT}%)`
                    : undefined,
                transitionDuration: `${PREVIEW_FADE_MS}ms`,
              }}
            />
            {incoming ? (
              <PreviewMedia
                clip={incoming}
                className="absolute inset-0 transition-opacity"
                style={{
                  opacity: frame.fadeT,
                  transform:
                    current.transition === "Slide" ? `translateX(${12 * (1 - frame.fadeT)}%)` : undefined,
                  transitionDuration: `${PREVIEW_FADE_MS}ms`,
                }}
              />
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
              <p className="truncate text-xs font-medium text-white">{current.filename}</p>
              <p className="text-[10px] tabular-nums text-white/70">
                {current.durationSec}s · {current.transition}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
