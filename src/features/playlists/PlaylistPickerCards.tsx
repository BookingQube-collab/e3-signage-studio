import { Link } from "@tanstack/react-router";
import { ListVideo } from "lucide-react";

import { E3EmptyState, E3Skeletons } from "@/components/e3";
import {
  PlaylistPreviewStrip,
  playlistDurationLabel,
} from "@/features/playlists/PlaylistPreviewStrip";
import { cn } from "@/lib/utils";
import type { Playlist } from "@/types";

export function PlaylistPickerCards({
  playlists,
  selectedId,
  onSelect,
  isLoading,
  isError,
  onRetry,
  columns = "campaign",
}: {
  playlists: Playlist[];
  selectedId: string;
  onSelect: (id: string, name: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** campaign: 2–3 cols for page layouts; modal: 2 cols for dialogs */
  columns?: "campaign" | "modal";
}) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading playlists">
        <E3Skeletons count={columns === "modal" ? 4 : 6} itemClassName="h-48 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <E3EmptyState
        icon={ListVideo}
        title="Could not load playlists"
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

  if (playlists.length === 0) {
    return (
      <E3EmptyState
        icon={ListVideo}
        title="No playlists yet"
        description="Create a playlist with media first, then pick it here."
        action={
          <Link
            to="/playlists/new"
            className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            Create playlist
          </Link>
        }
      />
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        columns === "modal" ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
      )}
      role="listbox"
      aria-label="Playlists"
    >
      {playlists.map((playlist) => {
        const items = Array.isArray(playlist.items) ? playlist.items : [];
        const selected = selectedId === playlist.id;
        return (
          <button
            key={playlist.id}
            type="button"
            role="option"
            aria-selected={selected}
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
      })}
    </div>
  );
}
