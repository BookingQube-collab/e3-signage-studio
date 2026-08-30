import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  FileImage,
  FolderInput,
  MoreVertical,
  Music,
  Pencil,
  PlayCircle,
  QrCode,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADMIN_QUERY_STALE_MS } from "@/lib/query-defaults";
import { firstHttpUrl } from "@/lib/playlist-preview";
import { cn } from "@/lib/utils";
import { isImageStillUrl, seekVideoToStillFrame, videoStillNeedsHydration } from "@/lib/video-poster";
import { mediaService } from "@/services";
import type { Media, MediaType } from "@/types";

const iconFor: Record<MediaType, typeof FileImage> = {
  Video: PlayCircle,
  Image: FileImage,
  QR: QrCode,
  Logo: Sparkles,
  Audio: Music,
};

/** Resolve a thumbnail icon for every media type — missing keys must never crash the library. */
export function mediaTypeIcon(type: string) {
  return iconFor[type as MediaType] ?? FileImage;
}

export function MediaThumb({
  item,
  className,
  playback = false,
}: {
  item: Media;
  className?: string;
  playback?: boolean;
}) {
  const { media: resolved, rootRef } = useHydratedVideoStill(item);
  const Icon = mediaTypeIcon(resolved.type);
  const isAudio = resolved.type === "Audio";
  const poster = firstHttpUrl(resolved.thumbnailUrl);
  const videoSrc =
    resolved.type === "Video"
      ? firstHttpUrl(resolved.previewUrl, isImageStillUrl(poster) ? null : poster)
      : null;
  // Audio preview URLs are MP3 — never feed them to <img>.
  const imageSrc =
    resolved.type === "Video"
      ? isImageStillUrl(poster)
        ? poster
        : null
      : isAudio
        ? firstHttpUrl(resolved.thumbnailUrl)
        : firstHttpUrl(resolved.thumbnailUrl, resolved.previewUrl);
  const audioSrc = isAudio ? firstHttpUrl(resolved.previewUrl) : null;

  return (
    <div
      ref={rootRef}
      className={cn("grid place-items-center overflow-hidden rounded-xl bg-muted", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${resolved.thumbnailHue} 55% 22%), hsl(${
          (resolved.thumbnailHue + 60) % 360
        } 45% 14%))`,
      }}
      aria-hidden={!playback}
    >
      {playback && audioSrc ? (
        <div className="flex w-full flex-col items-center gap-3 p-4">
          <Icon className="size-10 text-foreground/70" />
          <audio
            src={audioSrc}
            controls
            preload="metadata"
            className="w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          width={320}
          height={180}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : videoSrc ? (
        <video
          src={videoSrc}
          className="size-full object-cover"
          muted
          playsInline
          autoPlay={false}
          controls={playback}
          loop={false}
          // Still thumbs need bytes past t=0 so mid-intro seek (~2.5s) can paint.
          preload="auto"
          referrerPolicy="no-referrer"
          onLoadedMetadata={(event) => seekVideoToStillFrame(event.currentTarget)}
          onLoadedData={(event) => seekVideoToStillFrame(event.currentTarget)}
          onCanPlay={(event) => seekVideoToStillFrame(event.currentTarget)}
          onSeeked={(event) => {
            event.currentTarget.pause();
          }}
        />
      ) : (
        <Icon className="size-7 text-foreground/70" />
      )}
    </div>
  );
}

function useHydratedVideoStill(item: Media): {
  media: Media;
  rootRef: RefObject<HTMLDivElement | null>;
} {
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const needsHydration = videoStillNeedsHydration(item);

  useLayoutEffect(() => {
    if (!needsHydration || inView) return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, needsHydration]);

  const previewQuery = useQuery({
    queryKey: ["media", item.id, "preview"],
    queryFn: () => mediaService.get(item.id),
    enabled: needsHydration && inView,
    staleTime: ADMIN_QUERY_STALE_MS,
  });

  useEffect(() => {
    const full = previewQuery.data;
    if (!full?.id) return;
    qc.setQueryData<Media[]>(["media"], (prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((row) =>
        row.id === full.id
          ? {
              ...row,
              ...(full.thumbnailUrl ? { thumbnailUrl: full.thumbnailUrl } : {}),
              ...(full.previewUrl ? { previewUrl: full.previewUrl } : {}),
            }
          : row,
      );
    });
  }, [previewQuery.data, qc]);

  const full = previewQuery.data;
  const media =
    full && full.id === item.id
      ? {
          ...item,
          ...(full.thumbnailUrl ? { thumbnailUrl: full.thumbnailUrl } : {}),
          ...(full.previewUrl ? { previewUrl: full.previewUrl } : {}),
        }
      : item;
  return { media, rootRef };
}

export function E3MediaCard({
  item,
  view = "grid",
  size = "default",
  onOpen,
  onEdit,
  onDelete,
  selected,
  folderLabel,
  onMove,
  selectable,
  checked,
  selectionActive,
  onToggle,
}: {
  item: Media;
  view?: "grid" | "list";
  size?: "default" | "picker";
  onOpen?: (item: Media, event: MouseEvent<HTMLButtonElement>) => void;
  onEdit?: (item: Media) => void;
  onDelete?: (item: Media) => void;
  selected?: boolean;
  folderLabel?: string | null;
  onMove?: (item: Media) => void;
  selectable?: boolean;
  checked?: boolean;
  selectionActive?: boolean;
  onToggle?: (item: Media, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const sizeMb = Number.isFinite(item.sizeMb) ? item.sizeMb : 0;
  const meta = [item.dimensions, item.durationSec ? `${item.durationSec}s` : null, `${sizeMb.toFixed(1)} MB`]
    .filter(Boolean)
    .join(" · ");
  const picker = size === "picker";
  const highlighted = Boolean(selected || checked);

  if (view === "list") {
    return (
      <div
        data-media-card=""
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50",
          highlighted && "e3-gradient-border border-0",
        )}
      >
        {selectable ? (
          <SelectCheckbox
            item={item}
            checked={Boolean(checked)}
            alwaysVisible
            onToggle={onToggle}
          />
        ) : null}
        <button
          type="button"
          onClick={(event) => onOpen?.(item, event)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MediaThumb item={item} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.filename}</p>
            <p className="truncate text-xs text-muted-foreground">
              {folderLabel ? `${folderLabel} · ` : ""}
              {item.type} · {meta}
            </p>
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {item.modifiedAt}
          </span>
        </button>
        {onMove || onEdit || onDelete ? (
          <MediaActionsMenu item={item} onEdit={onEdit} onMove={onMove} onDelete={onDelete} />
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-media-card=""
      className={cn(
        "group relative flex w-full flex-col rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-e3-purple/40",
        highlighted && "e3-gradient-border border-0",
      )}
    >
      {selectable ? (
        <div className="absolute left-5 top-5 z-10">
          <SelectCheckbox
            item={item}
            checked={Boolean(checked)}
            alwaysVisible={Boolean(checked || selectionActive)}
            onToggle={onToggle}
          />
        </div>
      ) : null}
      <button
        type="button"
        onClick={(event) => onOpen?.(item, event)}
        className="flex w-full flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MediaThumb
          item={item}
          className={picker ? "aspect-[4/3] min-h-[140px] w-full" : "aspect-video w-full"}
        />
        <p className="mt-3 truncate text-sm font-medium">{item.filename}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {folderLabel ? `${folderLabel} · ` : ""}
          {picker ? item.type : `${item.type} · ${meta}`}
        </p>
      </button>
      {onMove || onEdit || onDelete ? (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <MediaActionsMenu item={item} onEdit={onEdit} onMove={onMove} onDelete={onDelete} />
        </div>
      ) : null}
    </div>
  );
}

function SelectCheckbox({
  item,
  checked,
  alwaysVisible,
  onToggle,
}: {
  item: Media;
  checked: boolean;
  alwaysVisible: boolean;
  onToggle?: ((item: Media, event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Deselect ${item.filename}` : `Select ${item.filename}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle?.(item, event);
      }}
      className={cn(
        "grid size-6 place-items-center rounded-md border-2 shadow-sm transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked
          ? "border-e3-purple bg-e3-purple text-white opacity-100"
          : "border-white/80 bg-card/90 text-transparent hover:text-muted-foreground",
        alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </button>
  );
}

function MediaActionsMenu({
  item,
  onEdit,
  onMove,
  onDelete,
}: {
  item: Media;
  onEdit?: ((item: Media) => void) | undefined;
  onMove?: ((item: Media) => void) | undefined;
  onDelete?: ((item: Media) => void) | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${item.filename}`}
          className="grid size-8 place-items-center rounded-lg border border-border bg-card/90 text-muted-foreground hover:text-foreground"
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onEdit ? (
          <DropdownMenuItem onSelect={() => onEdit(item)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
        ) : null}
        {onMove ? (
          <DropdownMenuItem onSelect={() => onMove(item)}>
            <FolderInput />
            Move to folder…
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <>
            {onEdit || onMove ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(item)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
