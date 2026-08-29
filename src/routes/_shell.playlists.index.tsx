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
import { PlaylistRowMenu } from "@/features/playlists/PlaylistRowMenu";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasPermission } from "@/lib/rbac";
import { hasQueryClientContext } from "@/lib/router-preload";
import { playlistService } from "@/services";
import type { Playlist } from "@/types";

export const Route = createFileRoute("/_shell/playlists/")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/playlists");
  },
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

function playlistItems(playlist: Playlist) {
  return Array.isArray(playlist.items) ? playlist.items : [];
}

function playlistDurationLabel(playlist: Playlist) {
  const total = playlistItems(playlist).reduce((sum, item) => sum + (item.durationSec || 0), 0);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

function PlaylistsPage() {
  const navigate = useNavigate();
  const { auth } = Route.useRouteContext();
  const canManage = Boolean(auth?.ok && hasPermission(auth.profile.role, "playlists.manage"));
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["playlists"],
    queryFn: playlistService.list,
    throwOnError: false,
  });

  const columns: E3Column<Playlist>[] = [
    {
      key: "name",
      header: "Playlist",
      cell: (p) => <span className="font-medium">{p.name || "Untitled"}</span>,
    },
    { key: "items", header: "Items", cell: (p) => playlistItems(p).length },
    {
      key: "duration",
      header: "Duration",
      cell: (p) => playlistDurationLabel(p),
    },
    { key: "screens", header: "Used by", cell: (p) => `${p.usedByScreens ?? 0} screens` },
    { key: "modified", header: "Last modified", cell: (p) => p.modifiedAt || "—" },
    {
      key: "status",
      header: "Status",
      cell: (p) => <E3StatusBadge status={p.status || "Draft"} />,
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            className: "w-14 text-right",
            cell: (p: Playlist) => <PlaylistRowMenu playlist={p} />,
          } satisfies E3Column<Playlist>,
        ]
      : []),
  ];

  return (
    <div>
      <E3PageHeader
        title="Playlists"
        description="Sequenced content loops assigned to screens and campaigns."
        actions={
          canManage ? (
            <E3Button variant="primary" asChild>
              <Link to="/playlists/new">
                <Plus /> New playlist
              </Link>
            </E3Button>
          ) : null
        }
      />

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {(data ?? []).length === 0 ? (
          <E3EmptyState
            icon={ListVideo}
            title="No playlists yet"
            description="Create a playlist to sequence media for your screens."
            action={
              canManage ? (
                <E3Button variant="primary" asChild>
                  <Link to="/playlists/new">
                    <Plus /> New playlist
                  </Link>
                </E3Button>
              ) : undefined
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
