import { Film, ImageIcon, ListVideo } from "lucide-react";

import { MediaThumb } from "@/components/e3";
import { playlistItemThumbMedia } from "@/lib/playlist-preview";
import { cn } from "@/lib/utils";
import type { Playlist, PlaylistItem } from "@/types";

const PREVIEW_LIMIT = 4;

function playlistItems(playlist: Playlist): PlaylistItem[] {
  return Array.isArray(playlist.items) ? playlist.items : [];
}

export function playlistDurationSec(playlist: Playlist): number {
  return playlistItems(playlist).reduce((sum, item) => sum + (item.durationSec || 0), 0);
}

export function playlistDurationLabel(playlist: Playlist): string {
  const total = playlistDurationSec(playlist);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function PlaylistPreviewStrip({
  playlist,
  size = "md",
  className,
}: {
  playlist: Playlist;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const items = playlistItems(playlist);
  const preview = items.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, items.length - preview.length);

  const thumbClass =
    size === "lg" ? "size-full rounded-lg" : size === "sm" ? "size-10 rounded-lg" : "size-14 rounded-xl";

  if (preview.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground",
          size === "lg" ? "aspect-video w-full" : size === "sm" ? "h-10 w-16" : "h-14 w-24",
          className,
        )}
        aria-label="Empty playlist"
      >
        <ListVideo className={size === "lg" ? "size-8 opacity-50" : "size-4 opacity-60"} aria-hidden />
        {size === "lg" ? <span className="text-sm">No media yet</span> : null}
      </div>
    );
  }

  if (size === "lg") {
    return (
      <div
        className={cn(
          "relative grid aspect-video w-full overflow-hidden rounded-xl border border-border bg-black/40",
          preview.length === 1
            ? "grid-cols-1"
            : preview.length === 2
              ? "grid-cols-2"
              : "grid-cols-2 grid-rows-2",
          className,
        )}
        aria-hidden
      >
        {preview.map((item, index) => (
          <div
            key={item.id || `${item.mediaId}-${index}`}
            className={cn(
              "relative min-h-0 overflow-hidden",
              preview.length === 3 && index === 0 && "row-span-2",
            )}
          >
            <MediaThumb item={playlistItemThumbMedia(item)} className={thumbClass} />
            <ItemTypeChip type={item.type} />
          </div>
        ))}
        {overflow > 0 ? (
          <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
            +{overflow}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)} aria-hidden>
      {preview.map((item, index) => (
        <div
          key={item.id || `${item.mediaId}-${index}`}
          className={cn(
            "relative shrink-0 overflow-hidden border-2 border-card shadow-sm",
            thumbClass,
            index > 0 && "-ml-2",
          )}
          style={{ zIndex: preview.length - index }}
        >
          <MediaThumb item={playlistItemThumbMedia(item)} className="size-full rounded-[inherit]" />
        </div>
      ))}
      {overflow > 0 ? (
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">+{overflow}</span>
      ) : null}
    </div>
  );
}

function ItemTypeChip({ type }: { type: PlaylistItem["type"] }) {
  const Icon = type === "Video" ? Film : ImageIcon;
  return (
    <span className="pointer-events-none absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white">
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
