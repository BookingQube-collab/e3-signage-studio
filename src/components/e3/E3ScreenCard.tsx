import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MonitorPlay } from "lucide-react";

import { MediaThumb } from "@/components/e3/E3MediaCard";
import { E3Progress } from "@/components/e3/E3Progress";
import { E3StatusBadge } from "@/components/e3/E3StatusBadge";
import { isPreviewPortrait, previewAspectRatio } from "@/lib/preview-orientation";
import { cn } from "@/lib/utils";
import type { Media, Screen, ScreenStatus } from "@/types";

const statusBar: Record<ScreenStatus, string> = {
  online: "bg-success",
  offline: "bg-destructive",
  syncing: "bg-info",
  disabled: "bg-muted-foreground/40",
};

function nowPlayingThumbMedia(screen: Screen): Media | null {
  if (!screen.nowPlayingMediaId) return null;
  const media: Media = {
    id: screen.nowPlayingMediaId,
    filename: screen.nowPlaying ?? "Now playing",
    type: screen.nowPlayingMediaType ?? "Video",
    dimensions: "",
    durationSec: null,
    sizeMb: 0,
    modifiedAt: "",
    uploadedBy: "",
    uploadedAt: "",
    version: "v1",
    thumbnailHue: 265,
    folderId: null,
    folderName: null,
    usedIn: { playlists: [], campaigns: [], screens: [] },
  };
  if (screen.nowPlayingThumbnailUrl) media.thumbnailUrl = screen.nowPlayingThumbnailUrl;
  if (screen.nowPlayingPreviewUrl) media.previewUrl = screen.nowPlayingPreviewUrl;
  return media;
}

export function E3ScreenCard({
  screen,
  className,
  overflow,
}: {
  screen: Screen;
  className?: string;
  overflow?: ReactNode;
}) {
  const playing = nowPlayingThumbMedia(screen);
  const portrait = isPreviewPortrait(screen.orientation);

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-e3-purple/40 hover:shadow-md",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-y-4 left-1.5 w-1 rounded-full",
          statusBar[screen.status],
        )}
        aria-hidden
      />
      <Link
        to="/screens/$id"
        params={{ id: screen.id }}
        className="block rounded-2xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="font-display truncate text-lg font-semibold tracking-tight">
              {screen.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {screen.locationName} · {screen.screenType} · {screen.orientation}
            </p>
          </div>
          <E3StatusBadge status={screen.status} />
        </div>

        <div
          className={cn(
            "mt-4 overflow-hidden rounded-xl border border-border bg-muted/30",
            portrait ? "mx-auto w-full max-w-[10.5rem]" : "w-full",
          )}
          style={{ aspectRatio: previewAspectRatio(screen.orientation) }}
        >
          {playing ? (
            <MediaThumb item={playing} className="size-full rounded-none" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-muted-foreground">
              <MonitorPlay className="size-8 opacity-40" aria-hidden />
              <span className="line-clamp-2 text-center text-xs">
                {screen.nowPlaying ?? "Nothing playing"}
              </span>
            </div>
          )}
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <MonitorPlay className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Now playing</dt>
            <dd className="min-w-0 truncate">{screen.nowPlaying ?? "Nothing playing"}</dd>
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <dt>Playlist</dt>
            <dd className="min-w-0 truncate text-foreground">{screen.playlistName ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <dt>Last seen</dt>
            <dd className="truncate tabular-nums text-foreground">{screen.lastSeen}</dd>
          </div>
        </dl>

        {screen.syncState === "Downloading" ? (
          <E3Progress className="mt-4" value={screen.syncProgress} label="Downloading" />
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <E3StatusBadge status={screen.syncState} dot={false} />
            <span className="truncate text-xs tabular-nums text-muted-foreground">
              {screen.lastSync}
            </span>
          </div>
        )}
      </Link>
      {overflow ? <div className="absolute right-3 top-14 z-10">{overflow}</div> : null}
    </div>
  );
}
