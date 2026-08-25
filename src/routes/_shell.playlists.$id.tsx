import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { E3Button, E3EmptyState, E3QueryBoundary } from "@/components/e3";
import { PlaylistBuilder } from "@/features/playlists/PlaylistBuilder";
import { playlistService } from "@/services";

export const Route = createFileRoute("/_shell/playlists/$id")({
  head: () => ({
    meta: [
      { title: "Edit playlist — E3 Digital Signage" },
      { name: "description", content: "Reorder, time and publish playlist content." },
      { property: "og:title", content: "Edit playlist — E3 Digital Signage" },
      { property: "og:description", content: "Reorder, time and publish playlist content." },
    ],
  }),
  component: EditPlaylistPage,
});

function EditPlaylistPage() {
  const { id } = Route.useParams();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => playlistService.get(id),
  });

  return (
    <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
      {data ? (
        <PlaylistBuilder key={data.id} initial={data} />
      ) : (
        <E3EmptyState
          title="Playlist not found"
          description="It may have been archived or deleted."
          action={
            <E3Button variant="outline" asChild>
              <Link to="/playlists">Back to playlists</Link>
            </E3Button>
          }
        />
      )}
    </E3QueryBoundary>
  );
}
