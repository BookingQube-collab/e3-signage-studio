import { Link } from "@tanstack/react-router";
import { LayoutTemplate, ListVideo } from "lucide-react";

import { E3EmptyState, E3Skeletons, MediaThumb } from "@/components/e3";
import { CampaignContentPreview } from "@/features/campaigns/CampaignContentPreview";
import { mediaForRef } from "@/features/layouts/LayoutCanvas";
import {
  PlaylistPreviewStrip,
  playlistDurationLabel,
} from "@/features/playlists/PlaylistPreviewStrip";
import { cn } from "@/lib/utils";
import type { Layout, Media, Playlist } from "@/types";

export function CampaignContentPicker({
  contentType,
  contentId,
  contentName,
  playlists,
  layouts,
  mediaLibrary,
  isLoading,
  isError,
  onSelect,
  onRetry,
}: {
  contentType: "Playlist" | "Layout";
  contentId: string;
  contentName: string;
  playlists: Playlist[];
  layouts: Layout[];
  mediaLibrary: Media[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (id: string, name: string) => void;
  onRetry?: () => void;
}) {
  const options = contentType === "Playlist" ? playlists : layouts;

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading content options">
        <E3Skeletons count={6} itemClassName="h-48 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <E3EmptyState
        icon={contentType === "Playlist" ? ListVideo : LayoutTemplate}
        title={`Could not load ${contentType.toLowerCase()}s`}
        description="Check your connection and try again."
        action={
          onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Retry
            </button>
          ) : undefined
        }
      />
    );
  }

  if (options.length === 0) {
    return (
      <E3EmptyState
        icon={contentType === "Playlist" ? ListVideo : LayoutTemplate}
        title={contentType === "Playlist" ? "No playlists yet" : "No layouts yet"}
        description={
          contentType === "Playlist"
            ? "Create a playlist with media first, then pick it for this campaign."
            : "Create a layout with zones first, then pick it for this campaign."
        }
        action={
          <Link
            to={contentType === "Playlist" ? "/playlists/new" : "/layouts/new"}
            className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            {contentType === "Playlist" ? "Create playlist" : "Create layout"}
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {contentType === "Playlist"
          ? playlists.map((playlist) => {
              const items = Array.isArray(playlist.items) ? playlist.items : [];
              const selected = contentId === playlist.id;
              return (
                <button
                  key={playlist.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(playlist.id, playlist.name)}
                  className={cn(
                    "rounded-xl border bg-card p-3 text-left transition-colors",
                    selected
                      ? "e3-gradient-border border-transparent ring-2 ring-e3-pink/70"
                      : "border-border hover:border-e3-purple/40 hover:bg-accent/40",
                  )}
                >
                  <PlaylistPreviewStrip playlist={playlist} size="lg" />
                  <span className="mt-3 block truncate font-medium text-foreground">
                    {playlist.name || "Untitled playlist"}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                    {items.length} item{items.length === 1 ? "" : "s"}
                    {items.length > 0 ? ` · ${playlistDurationLabel(playlist)}` : ""}
                  </span>
                </button>
              );
            })
          : layouts.map((layout) => {
              const zones = Array.isArray(layout.zones) ? layout.zones : [];
              const selected = contentId === layout.id;
              return (
                <button
                  key={layout.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(layout.id, layout.name)}
                  className={cn(
                    "rounded-xl border bg-card p-3 text-left transition-colors",
                    selected
                      ? "e3-gradient-border border-transparent ring-2 ring-e3-pink/70"
                      : "border-border hover:border-e3-purple/40 hover:bg-accent/40",
                  )}
                >
                  <LayoutPickerPreview layout={layout} mediaLibrary={mediaLibrary} />
                  <span className="mt-3 block truncate font-medium text-foreground">
                    {layout.name || "Untitled layout"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {layout.preset} · {zones.length} zone{zones.length === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
      </div>

      {contentId ? (
        <CampaignContentPreview
          contentType={contentType}
          contentId={contentId}
          contentName={contentName}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Select a {contentType.toLowerCase()} to see how it will look on screen.
        </p>
      )}
    </div>
  );
}

function LayoutPickerPreview({
  layout,
  mediaLibrary,
}: {
  layout: Layout;
  mediaLibrary: Media[];
}) {
  const zones = Array.isArray(layout.zones) ? layout.zones : [];
  const portrait = layout.orientation === "Portrait";

  if (zones.length === 0) {
    return (
      <div
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground"
        aria-label="Empty layout"
      >
        <LayoutTemplate className="size-8 opacity-50" aria-hidden />
        <span className="ml-2 text-sm">No zones yet</span>
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border"
      style={{
        aspectRatio: portrait ? "9 / 16" : "16 / 9",
        background: layout.background || "#19161A",
      }}
      aria-hidden
    >
      {zones.map((zone, index) => {
        const media = mediaForRef(mediaLibrary, zone.contentRef);
        return (
          <div
            key={zone.id || `zone-${index}`}
            className="absolute overflow-hidden border border-white/15"
            style={{
              left: `${zone.x ?? 0}%`,
              top: `${zone.y ?? 0}%`,
              width: `${zone.width ?? 100}%`,
              height: `${zone.height ?? 100}%`,
              background: zone.background || "rgba(25,22,26,0.9)",
            }}
          >
            {media ? (
              <MediaThumb item={media} className="size-full rounded-none" />
            ) : (
              <div className="grid size-full place-items-center bg-black/35 px-1">
                <span className="truncate text-center text-[10px] font-medium uppercase tracking-wide text-white/85">
                  {zone.name || zone.contentType}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
