import { firstHttpUrl } from "@/lib/playlist-preview";
import { cn } from "@/lib/utils";
import { isImageStillUrl, seekVideoToStillFrame } from "@/lib/video-poster";
import type { FitMode, Layout, LayoutZone, Media } from "@/types";

function fitObjectClass(fit: FitMode | null | undefined): string {
  switch (fit) {
    case "Contain":
      return "object-contain";
    case "Fill":
    case "Stretch":
      return "object-fill";
    case "Cover":
    default:
      return "object-cover";
  }
}

export function mediaForRef(library: Media[], contentRef: string | null | undefined): Media | null {
  if (!contentRef) return null;
  return library.find((item) => item.filename === contentRef || item.id === contentRef) ?? null;
}

function ZoneMediaFill({
  media,
  fit,
  playback,
}: {
  media: Media;
  fit: FitMode;
  playback?: boolean;
}) {
  const poster = firstHttpUrl(media.thumbnailUrl);
  const videoSrc =
    media.type === "Video"
      ? firstHttpUrl(media.previewUrl, isImageStillUrl(poster) ? null : poster)
      : null;
  const imageSrc =
    media.type === "Video"
      ? isImageStillUrl(poster)
        ? poster
        : null
      : firstHttpUrl(media.thumbnailUrl, media.previewUrl);
  const objectClass = fitObjectClass(fit);

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className={cn("absolute inset-0 size-full", objectClass)}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }

  if (videoSrc) {
    return (
      <video
        src={videoSrc}
        className={cn("absolute inset-0 size-full", objectClass)}
        muted
        playsInline
        autoPlay={playback}
        loop={playback}
        preload={playback ? "auto" : "metadata"}
        onLoadedMetadata={(event) => {
          if (!playback) seekVideoToStillFrame(event.currentTarget);
        }}
        onLoadedData={(event) => {
          if (!playback) seekVideoToStillFrame(event.currentTarget);
        }}
      />
    );
  }

  return null;
}

export function LayoutCanvas({
  layout,
  zones,
  mediaLibrary,
  selectedId,
  interactive,
  onSelect,
  onAssign,
  className,
}: {
  layout: Layout;
  zones: LayoutZone[];
  mediaLibrary: Media[];
  selectedId?: string | null;
  interactive?: boolean;
  onSelect?: (id: string) => void;
  onAssign?: (zoneId: string, media: Media) => void;
  className?: string;
}) {
  const portrait = layout.orientation === "Portrait";

  return (
    <div
      className={cn(
        "relative mx-auto w-full overflow-hidden rounded-xl border border-border",
        portrait ? "max-w-sm" : "",
        className,
      )}
      style={{
        aspectRatio: portrait ? "9 / 16" : "16 / 9",
        background: layout.background,
      }}
    >
      {zones.map((z) => {
        const media = mediaForRef(mediaLibrary, z.contentRef);
        const selected = Boolean(interactive && selectedId === z.id);
        const sharedClassName = cn(
          "absolute overflow-hidden border text-left transition-colors",
          interactive ? "cursor-pointer" : "",
          selected ? "border-transparent ring-2 ring-e3-pink ring-inset" : "border-white/10",
          interactive && !selected ? "hover:border-white/25" : "",
        );
        const sharedStyle = {
          left: `${z.x}%`,
          top: `${z.y}%`,
          width: `${z.width}%`,
          height: `${z.height}%`,
          background: z.background,
        } as const;
        const playZone = !interactive || selected;
        const body = (
          <>
            {media ? <ZoneMediaFill media={media} fit={z.fit} playback={playZone} /> : null}
            <span
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-2 pt-6",
                media
                  ? ""
                  : "inset-0 grid place-items-center bg-none from-transparent via-transparent to-transparent px-2 py-2",
              )}
            >
              <span className={cn("min-w-0", media ? "block" : "text-center")}>
                <span className="font-display block truncate text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:text-xs">
                  {z.name}
                </span>
                <span className="block truncate text-[10px] text-white/70 sm:text-[11px]">
                  {z.contentRef ?? z.contentType}
                </span>
              </span>
            </span>
          </>
        );

        if (interactive) {
          return (
            <button
              key={z.id}
              type="button"
              onClick={onSelect ? () => onSelect(z.id) : undefined}
              onDragOver={(e) => e.preventDefault()}
              onDrop={
                onAssign
                  ? (e) => {
                      e.preventDefault();
                      const filename = e.dataTransfer.getData("text/plain");
                      const mediaId = e.dataTransfer.getData("application/x-e3-media-id");
                      const dropped =
                        (mediaId
                          ? mediaLibrary.find((item) => item.id === mediaId)
                          : undefined) ??
                        mediaLibrary.find((item) => item.filename === filename);
                      if (dropped) onAssign(z.id, dropped);
                    }
                  : undefined
              }
              className={sharedClassName}
              style={sharedStyle}
            >
              {body}
            </button>
          );
        }

        return (
          <div key={z.id} className={sharedClassName} style={sharedStyle}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
