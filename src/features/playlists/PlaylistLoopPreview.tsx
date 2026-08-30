import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import {
  elapsedOffsetForMedia,
  firstHttpUrl,
  previewFrameAt,
  previewLayerStyle,
  type PreviewClip,
  type PreviewFrame,
} from "@/lib/playlist-preview";
import { isUuid } from "@/services/inventory-map";
import { mediaService } from "@/services";

const STAGE_BG =
  "radial-gradient(ellipse at 20% 10%, rgba(141,92,221,.22), transparent 60%), #0f0d11";

function FilenameFallback({
  filename,
  className,
  style,
}: {
  filename: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn("grid size-full place-items-center bg-black/40", className)} style={style}>
      <p className="max-w-[90%] truncate px-3 text-center text-sm font-medium text-white/80">
        {filename}
      </p>
    </div>
  );
}

function PreviewMedia({
  clip,
  className,
  active,
}: {
  clip: PreviewClip;
  className?: string;
  active?: boolean;
}) {
  const playable =
    clip.kind === "video"
      ? firstHttpUrl(clip.previewUrl)
      : firstHttpUrl(clip.previewUrl, clip.thumbnailUrl);
  const [src, setSrc] = useState<string | null>(playable);
  const [failed, setFailed] = useState(false);
  const [resolving, setResolving] = useState(!playable && isUuid(clip.mediaId));
  const retried = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const next =
      clip.kind === "video"
        ? firstHttpUrl(clip.previewUrl)
        : firstHttpUrl(clip.previewUrl, clip.thumbnailUrl);
    setSrc(next);
    setFailed(false);
    retried.current = false;
    if (next) {
      setResolving(false);
      return;
    }
    if (!isUuid(clip.mediaId)) {
      setResolving(false);
      setFailed(true);
      return;
    }
    let cancelled = false;
    setResolving(true);
    void (async () => {
      try {
        const media = await mediaService.get(clip.mediaId);
        const url =
          clip.kind === "video"
            ? firstHttpUrl(media?.previewUrl)
            : firstHttpUrl(media?.previewUrl, media?.thumbnailUrl);
        if (!cancelled && url) {
          setSrc(url);
          setResolving(false);
          return;
        }
        const fresh = await mediaService.downloadUrl(clip.mediaId);
        if (!cancelled) {
          const signed = firstHttpUrl(fresh.url);
          setSrc(signed);
          setFailed(!signed);
          setResolving(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setResolving(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.id, clip.mediaId, clip.kind, clip.previewUrl, clip.thumbnailUrl]);

  async function refreshSignedUrl() {
    if (retried.current || !isUuid(clip.mediaId)) {
      setFailed(true);
      return;
    }
    retried.current = true;
    try {
      const fresh = await mediaService.downloadUrl(clip.mediaId);
      const url = firstHttpUrl(fresh.url);
      if (url) {
        setSrc(url);
        setFailed(false);
      } else {
        setSrc(null);
        setFailed(true);
      }
    } catch {
      setSrc(null);
      setFailed(true);
    }
  }

  useEffect(() => {
    const el = videoRef.current;
    if (!el || clip.kind !== "video") return;
    if (active) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [active, src, clip.kind]);

  if (failed && !src) {
    return <FilenameFallback filename={clip.filename} className={className} />;
  }

  if (!src) {
    return (
      <div className={cn("grid size-full place-items-center bg-black", className)}>
        {resolving ? <span className="sr-only">Loading preview</span> : null}
      </div>
    );
  }

  if (clip.kind === "video") {
    return (
      <video
        ref={videoRef}
        key={`${clip.id}:${src}`}
        src={src}
        poster={firstHttpUrl(clip.thumbnailUrl) ?? undefined}
        className={cn("size-full object-contain", className)}
        muted
        playsInline
        autoPlay={active}
        loop={false}
        preload="auto"
        referrerPolicy="no-referrer"
        onEnded={(event) => {
          event.currentTarget.pause();
        }}
        onError={() => void refreshSignedUrl()}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={cn("size-full object-contain", className)}
      referrerPolicy="no-referrer"
      onError={() => void refreshSignedUrl()}
    />
  );
}

function ClipLayer({
  clip,
  style,
  active,
}: {
  clip: PreviewClip;
  style: CSSProperties;
  active?: boolean;
}) {
  return (
    <div className="absolute inset-0 will-change-transform" style={style}>
      <PreviewMedia clip={clip} className="size-full" active={active} />
    </div>
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
    return elapsedOffsetForMedia(clips, startMediaId);
  }, [clips, startMediaId]);

  const orderKey = clips.map((clip) => clip.id).join("|");
  const fxKey = clips.map((clip) => `${clip.id}:${clip.transition}`).join("|");
  const [startedAt, setStartedAt] = useState(() => Date.now() - originMs);
  const [frame, setFrame] = useState<PreviewFrame | null>(() => previewFrameAt(clips, originMs, loop));
  const orderRef = useRef(orderKey);
  const fxRef = useRef(fxKey);
  const countRef = useRef(clips.length);

  useEffect(() => {
    setStartedAt(Date.now() - originMs);
  }, [originMs]);

  useEffect(() => {
    if (orderKey !== orderRef.current) {
      const grew = clips.length > countRef.current;
      orderRef.current = orderKey;
      fxRef.current = fxKey;
      countRef.current = clips.length;
      const jumpId = grew ? clips[clips.length - 1]?.mediaId : startMediaId;
      setStartedAt(Date.now() - elapsedOffsetForMedia(clips, jumpId));
      return;
    }
    if (fxKey !== fxRef.current) {
      const prev = fxRef.current.split("|");
      fxRef.current = fxKey;
      const changed = clips.find((clip, index) => prev[index] !== `${clip.id}:${clip.transition}`);
      if (changed) setStartedAt(Date.now() - elapsedOffsetForMedia(clips, changed.mediaId));
    }
  }, [clips, fxKey, orderKey, startMediaId]);

  useEffect(() => {
    if (clips.length === 0) {
      setFrame(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      setFrame(previewFrameAt(clips, Date.now() - startedAt, loop));
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [clips, loop, startedAt]);

  const current = frame ? clips[frame.index] : undefined;
  const previous =
    frame && frame.progress < 1 && frame.prevIndex !== frame.index ? clips[frame.prevIndex] : undefined;
  const soundtrack = current?.kind === "image" ? firstHttpUrl(current.audioUrl) : null;

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-border", className)}
      style={{ background: STAGE_BG }}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {clips.length === 0 || !current || !frame ? (
          <div className="grid size-full place-items-center text-center">
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : (
          <>
            {previous ? (
              <ClipLayer
                clip={previous}
                active={false}
                style={previewLayerStyle("previous", frame.effect, frame.progress)}
              />
            ) : null}
            <ClipLayer
              clip={current}
              active
              style={previewLayerStyle("current", frame.effect, frame.progress)}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
              <p className="truncate text-xs font-medium text-white">{current.filename}</p>
              <p className="text-[10px] tabular-nums text-white/70">
                {current.durationSec}s · {current.transition}
              </p>
            </div>
            {soundtrack ? (
              <audio
                key={`${current.id}:${soundtrack}`}
                src={soundtrack}
                autoPlay
                playsInline
                preload="auto"
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
