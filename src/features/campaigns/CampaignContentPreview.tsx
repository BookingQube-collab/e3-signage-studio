import { useQuery } from "@tanstack/react-query";

import { LayoutCanvas } from "@/features/layouts/LayoutCanvas";
import { PlaylistLoopPreview } from "@/features/playlists/PlaylistLoopPreview";
import { bindPreviewClips } from "@/lib/playlist-preview";
import { cn } from "@/lib/utils";
import { layoutService, mediaService, playlistService } from "@/services";

export function CampaignContentPreview({
  contentType,
  contentId,
  contentName,
  className,
}: {
  contentType: "Playlist" | "Layout";
  contentId: string;
  contentName: string;
  className?: string;
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

  if (!contentId) {
    return (
      <EmptyStage
        className={className}
        label="Select content to preview how it will look on screen"
      />
    );
  }

  if (contentType === "Playlist") {
    if (playlistQuery.isLoading || mediaQuery.isLoading) {
      return <EmptyStage className={className} label="Loading preview…" />;
    }
    if (playlistQuery.isError || !playlistQuery.data) {
      return (
        <EmptyStage
          className={className}
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
    return <EmptyStage className={className} label="Loading preview…" />;
  }
  if (layoutQuery.isError || !layoutQuery.data) {
    return (
      <EmptyStage
        className={className}
        label={contentName ? `Could not load “${contentName}”` : "Could not load layout"}
      />
    );
  }

  const layout = layoutQuery.data;
  const zones = Array.isArray(layout.zones) ? layout.zones : [];

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">On-screen preview</p>
      {zones.length === 0 ? (
        <EmptyStage label={`${layout.name || contentName} has no zones yet`} />
      ) : (
        <LayoutCanvas layout={layout} zones={zones} mediaLibrary={mediaLibrary} />
      )}
    </div>
  );
}

function EmptyStage({ className, label }: { className?: string | undefined; label: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">On-screen preview</p>
      <div
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-border"
        style={{
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
