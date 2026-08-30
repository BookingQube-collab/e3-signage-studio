import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, ListVideo, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3EmptyState,
  E3PageHeader,
  E3QueryBoundary,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlaylistRowMenu } from "@/features/playlists/PlaylistRowMenu";
import {
  PlaylistPreviewStrip,
  playlistDurationLabel,
} from "@/features/playlists/PlaylistPreviewStrip";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasPermission } from "@/lib/rbac";
import { hasQueryClientContext } from "@/lib/router-preload";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { playlistService } from "@/services";
import type { Playlist, PlaylistStatus } from "@/types";

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

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Draft", label: "Draft" },
  { value: "Scheduled", label: "Scheduled" },
  { value: "Archived", label: "Archived" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];
type UsageFilter = "all" | "assigned" | "unused";
type ItemsFilter = "all" | "has-items" | "empty";

function playlistItems(playlist: Playlist) {
  return Array.isArray(playlist.items) ? playlist.items : [];
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

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [usage, setUsage] = useState<UsageFilter>("all");
  const [itemsFilter, setItemsFilter] = useState<ItemsFilter>("all");
  const [view, setView] = useState<"list" | "grid">("list");

  const playlists = Array.isArray(data) ? data : [];

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return playlists.filter((p) => {
      if (q) {
        const hay = `${p.name} ${playlistItems(p)
          .map((item) => item.filename)
          .join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status !== "all" && (p.status || "Draft") !== status) return false;
      const screens = p.usedByScreens ?? 0;
      if (usage === "assigned" && screens <= 0) return false;
      if (usage === "unused" && screens > 0) return false;
      const count = playlistItems(p).length;
      if (itemsFilter === "has-items" && count === 0) return false;
      if (itemsFilter === "empty" && count > 0) return false;
      return true;
    });
  }, [playlists, debouncedSearch, status, usage, itemsFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: playlists.length,
      Active: 0,
      Draft: 0,
      Scheduled: 0,
      Archived: 0,
    };
    for (const p of playlists) {
      const value = (p.status || "Draft") as PlaylistStatus;
      if (value in counts) counts[value as Exclude<StatusFilter, "all">] += 1;
    }
    return counts;
  }, [playlists]);

  const filtersActive =
    Boolean(search) || status !== "all" || usage !== "all" || itemsFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setUsage("all");
    setItemsFilter("all");
  }

  function openPlaylist(p: Playlist) {
    void navigate({ to: "/playlists/$id", params: { id: p.id } });
  }

  const columns: E3Column<Playlist>[] = [
    {
      key: "name",
      header: "Playlist",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <PlaylistPreviewStrip playlist={p} size="sm" className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name || "Untitled"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {playlistItems(p).length === 0
                ? "No media yet"
                : playlistItems(p)
                    .slice(0, 2)
                    .map((item) => item.filename)
                    .join(" · ")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      cell: (p) => <span className="tabular-nums">{playlistItems(p).length}</span>,
    },
    {
      key: "duration",
      header: "Duration",
      cell: (p) => <span className="tabular-nums">{playlistDurationLabel(p)}</span>,
    },
    {
      key: "screens",
      header: "Used by",
      cell: (p) => (
        <span className="tabular-nums">{p.usedByScreens ?? 0} screens</span>
      ),
    },
    {
      key: "modified",
      header: "Last modified",
      cell: (p) => <span className="tabular-nums text-muted-foreground">{p.modifiedAt || "—"}</span>,
    },
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

      <E3Card className="mb-5">
        <E3CardBody className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.4fr)_repeat(2,minmax(0,1fr))_auto]">
          <FilterField label="Search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Playlist or media name"
                aria-label="Search playlists"
                className="pl-9"
              />
            </div>
          </FilterField>
          <FilterField label="Used on screens">
            <Select value={usage} onValueChange={(v) => setUsage(v as UsageFilter)}>
              <SelectTrigger aria-label="Filter by screen usage">
                <SelectValue placeholder="Usage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All playlists</SelectItem>
                <SelectItem value="assigned">Assigned to screens</SelectItem>
                <SelectItem value="unused">Not assigned</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Items">
            <Select value={itemsFilter} onValueChange={(v) => setItemsFilter(v as ItemsFilter)}>
              <SelectTrigger aria-label="Filter by item count">
                <SelectValue placeholder="Items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any length</SelectItem>
                <SelectItem value="has-items">Has media</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="View">
            <div
              className="flex w-fit overflow-hidden rounded-xl border border-border"
              role="group"
              aria-label="Result layout"
            >
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={cn(
                  "grid size-10 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                  view === "list" && "bg-accent text-foreground",
                )}
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={cn(
                  "grid size-10 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                  view === "grid" && "bg-accent text-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
          </FilterField>
        </E3CardBody>
      </E3Card>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((item) => {
          const selected = status === item.value;
          const count = statusCounts[item.value];
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setStatus(item.value === "all" || selected ? "all" : item.value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                selected
                  ? "e3-gradient border-transparent text-white"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item.label}
              <span className={cn("ml-1.5", selected ? "text-white/80" : "text-muted-foreground")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-muted-foreground">
          {filtersActive
            ? `${filtered.length} of ${playlists.length} playlists`
            : `${playlists.length} playlists`}
        </p>
        {filtersActive ? (
          <E3Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </E3Button>
        ) : null}
      </div>

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {playlists.length === 0 ? (
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
        ) : filtered.length === 0 ? (
          <E3EmptyState
            icon={Search}
            title="No playlists match"
            description="Nothing matches these filters. Clear them to see the full list."
            action={
              <E3Button variant="outline" onClick={clearFilters}>
                Clear filters
              </E3Button>
            }
          />
        ) : view === "list" ? (
          <E3Table
            columns={columns}
            rows={filtered}
            rowKey={(p) => p.id}
            onRowClick={openPlaylist}
            caption="All playlists"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <PlaylistCard
                key={p.id}
                playlist={p}
                overflow={canManage ? <PlaylistRowMenu playlist={p} /> : undefined}
              />
            ))}
          </div>
        )}
      </E3QueryBoundary>
    </div>
  );
}

function PlaylistCard({
  playlist,
  overflow,
}: {
  playlist: Playlist;
  overflow?: ReactNode;
}) {
  const items = playlistItems(playlist);
  return (
    <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-e3-purple/40 hover:shadow-md">
      <Link
        to="/playlists/$id"
        params={{ id: playlist.id }}
        className="block rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlaylistPreviewStrip playlist={playlist} size="lg" />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display truncate text-lg font-semibold tracking-tight">
              {playlist.name || "Untitled"}
            </h3>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {items.length} item{items.length === 1 ? "" : "s"} · {playlistDurationLabel(playlist)} ·{" "}
              {playlist.usedByScreens ?? 0} screens
            </p>
          </div>
          <E3StatusBadge status={playlist.status || "Draft"} />
        </div>
        <p className="mt-3 text-xs tabular-nums text-muted-foreground">
          Modified {playlist.modifiedAt || "—"}
        </p>
      </Link>
      {overflow ? <div className="absolute right-3 top-3 z-10">{overflow}</div> : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
