import { useQuery } from "@tanstack/react-query";

import { LayoutCanvas } from "@/features/layouts/LayoutCanvas";
import { PlaylistLoopPreview } from "@/features/playlists/PlaylistLoopPreview";
import { bindPreviewClips } from "@/lib/playlist-preview";
import {
  isPreviewPortrait,
  isPreviewUpsideDown,
  previewAspectRatio,
  resolveCampaignPreviewOrientation,
} from "@/lib/preview-orientation";
import { cn } from "@/lib/utils";
import { layoutService, mediaService, playlistService } from "@/services";
import type { Orientation } from "@/types";

export function CampaignContentPreview({
  contentType,
  contentId,
  contentName,
  className,
  /** Orientations of selected target screens (campaign step 5). */
  screenOrientations,
}: {
  contentType: "Playlist" | "Layout";
  contentId: string;
  contentName: string;
  className?: string;
  screenOrientations?: Array<string | null | undefined>;
}) {
  const mediaQuery = useQuery({
    queryKey: ["media"],
    queryFn: mediaService.list,
    enabled: Boolean(contentId),
  });

  const playlistQuery = useQuery({
    queryKey: ["playlist", contentId],
    queryFn: () => playlistService.get(contentId),
    enabled: contentType === "Playlist" && Boolean(contentId),
  });

  const layoutQuery = useQuery({
    queryKey: ["layout", contentId],
    queryFn: () => layoutService.get(contentId),
    enabled: contentType === "Layout" && Boolean(contentId),
  });

  const mediaLibrary = mediaQuery.data ?? [];
  const mediaById = new Map(mediaLibrary.map((m) => [m.id, m]));
  const layoutOrientation =
    contentType === "Layout" ? layoutQuery.data?.orientation : undefined;
  const previewOrientation = resolveCampaignPreviewOrientation(
    screenOrientations ?? [],
    layoutOrientation,
  );

  if (!contentId) {
    return (
      <EmptyStage
        className={className}
        orientation={previewOrientation}
        label="Select content to preview how it will look on screen"
      />
    );
  }

  if (contentType === "Playlist") {
    if (playlistQuery.isLoading || mediaQuery.isLoading) {
      return (
        <EmptyStage className={className} orientation={previewOrientation} label="Loading preview…" />
      );
    }
    if (playlistQuery.isError || !playlistQuery.data) {
      return (
        <EmptyStage
          className={className}
          orientation={previewOrientation}
          label={contentName ? `Could not load “${contentName}”` : "Could not load playlist"}
        />
      );
    }
    const clips = bindPreviewClips(playlistQuery.data.items ?? [], mediaById);
    return (
      <div className={cn("space-y-2", className)}>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">On-screen preview</p>
        <PlaylistLoopPreview
          clips={clips}
          orientation={previewOrientation}
          emptyLabel={
            clips.length === 0
              ? `${playlistQuery.data.name || contentName} has no media yet`
              : "Add media to preview"
          }
        />
      </div>
    );
  }

  if (layoutQuery.isLoading || mediaQuery.isLoading) {
    return (
      <EmptyStage className={className} orientation={previewOrientation} label="Loading preview…" />
    );
  }
  if (layoutQuery.isError || !layoutQuery.data) {
    return (
      <EmptyStage
        className={className}
        orientation={previewOrientation}
        label={contentName ? `Could not load “${contentName}”` : "Could not load layout"}
      />
    );
  }

  const layout = layoutQuery.data;
  const zones = Array.isArray(layout.zones) ? layout.zones : [];
  // Frame follows resolved screen orientation; zone layout data stays unchanged.
  const frameOrientation: Orientation = isPreviewPortrait(previewOrientation)
    ? isPreviewUpsideDown(previewOrientation)
      ? "Portrait (upside down)"
      : "Portrait"
    : isPreviewUpsideDown(previewOrientation)
      ? "Landscape (upside down)"
      : "Landscape";
  const layoutForPreview = { ...layout, orientation: frameOrientation };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">On-screen preview</p>
      {zones.length === 0 ? (
        <EmptyStage
          orientation={previewOrientation}
          label={`${layout.name || contentName} has no zones yet`}
        />
      ) : (
        <LayoutCanvas layout={layoutForPreview} zones={zones} mediaLibrary={mediaLibrary} />
      )}
    </div>
  );
}

function EmptyStage({
  className,
  label,
  orientation,
}: {
  className?: string | undefined;
  label: string;
  orientation?: string | null;
}) {
  const portrait = isPreviewPortrait(orientation);
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">On-screen preview</p>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border",
          portrait ? "mx-auto w-full max-w-sm" : "w-full",
        )}
        style={{
          aspectRatio: previewAspectRatio(orientation),
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(141,92,221,.22), transparent 60%), #0f0d11",
        }}
      >
        <div className="grid size-full place-items-center bg-black/40 px-4 text-center">
          <p className="text-sm font-medium text-white/75">{label}</p>
        </div>
      </div>
    </div>
  );
}
