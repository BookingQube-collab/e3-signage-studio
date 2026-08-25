import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListVideo, Plus } from "lucide-react";

import {
  E3Button,
  E3EmptyState,
  E3PageHeader,
  E3QueryBoundary,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { playlistService } from "@/services";
import type { Playlist } from "@/types";

export const Route = createFileRoute("/_shell/playlists/")({
  head: () => ({
    meta: [
      { title: "Playlists — E3 Digital Signage" },
      {
        name: "description",
        content: "Build and manage looping content playlists for every E3 screen.",
      },
      { property: "og:title", content: "Playlists — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Build and manage looping content playlists for every E3 screen.",
      },
    ],
  }),
  component: PlaylistsPage,
});

function PlaylistsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["playlists"],
    queryFn: playlistService.list,
  });

  const columns: E3Column<Playlist>[] = [
    {
      key: "name",
      header: "Playlist",
      cell: (p) => <span className="font-medium">{p.name}</span>,
    },
    { key: "items", header: "Items", cell: (p) => p.items.length },
    {
      key: "duration",
      header: "Duration",
      cell: (p) => {
        const total = p.items.reduce((s, i) => s + i.durationSec, 0);
        return `${Math.floor(total / 60)}m ${total % 60}s`;
      },
    },
    { key: "screens", header: "Used by", cell: (p) => `${p.usedByScreens} screens` },
    { key: "modified", header: "Last modified", cell: (p) => p.modifiedAt },
    { key: "status", header: "Status", cell: (p) => <E3StatusBadge status={p.status} /> },
  ];

  return (
    <div>
      <E3PageHeader
        title="Playlists"
        description="Sequenced content loops assigned to screens and campaigns."
        actions={
          <E3Button variant="primary" asChild>
            <Link to="/playlists/new">
              <Plus /> New playlist
            </Link>
          </E3Button>
        }
      />

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {(data ?? []).length === 0 ? (
          <E3EmptyState
            icon={ListVideo}
            title="No playlists yet"
            description="Create a playlist to sequence media for your screens."
            action={
              <E3Button variant="primary" asChild>
                <Link to="/playlists/new">
                  <Plus /> New playlist
                </Link>
              </E3Button>
            }
          />
        ) : (
          <E3Table
            columns={columns}
            rows={data ?? []}
            rowKey={(p) => p.id}
            onRowClick={(p) => void navigate({ to: "/playlists/$id", params: { id: p.id } })}
            caption="All playlists"
          />
        )}
      </E3QueryBoundary>
    </div>
  );
}
