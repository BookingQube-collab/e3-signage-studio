import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, Monitor, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3EmptyState,
  E3Modal,
  E3PageHeader,
  E3Progress,
  E3QueryBoundary,
  E3ScreenCard,
  E3Skeletons,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PairScreenDialog } from "@/features/screens/PairScreenDialog";
import { ScreenRowMenu } from "@/features/screens/ScreenRowMenu";
import { adminMonitoringRefetchInterval } from "@/lib/monitoring";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasPermission } from "@/lib/rbac";
import { hasQueryClientContext } from "@/lib/router-preload";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useLiveMonitoring } from "@/lib/use-live-monitoring";
import { useViewPreference } from "@/lib/view-preference";
import { cn } from "@/lib/utils";
import { locationService, screenGroupService, screenService } from "@/services";
import type { Screen, ScreenGroup, ScreenStatus } from "@/types";

const SCREEN_VIEWS = ["table", "grid"] as const;

export const Route = createFileRoute("/_shell/screens/")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/screens");
  },
  head: () => ({
    meta: [
      { title: "Screens — E3 Digital Signage" },
      {
        name: "description",
        content: "Monitor every paired screen, its playlist, sync state and last heartbeat.",
      },
      { property: "og:title", content: "Screens — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Monitor every paired screen, its playlist, sync state and last heartbeat.",
      },
    ],
  }),
  component: ScreensPage,
});

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "syncing", label: "Syncing" },
  { value: "offline", label: "Offline" },
  { value: "disabled", label: "Disabled" },
] as const;

function ScreensPage() {
  const navigate = useNavigate();
  const { auth } = Route.useRouteContext();
  const qc = useQueryClient();
  const canManageScreens = Boolean(auth?.ok && hasPermission(auth.profile.role, "screens.manage"));
  const [view, setView] = useViewPreference("screens", SCREEN_VIEWS, "table");
  const [pairOpen, setPairOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [locationId, setLocationId] = useState("all");
  const [status, setStatus] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [orientation, setOrientation] = useState("all");

  const screensQuery = useQuery({
    queryKey: ["screens"],
    queryFn: screenService.list,
    refetchInterval: adminMonitoringRefetchInterval,
  });
  useLiveMonitoring([["screens"], ["dashboard"]]);
  const locations = useQuery({ queryKey: ["locations"], queryFn: locationService.list });
  const groups = useQuery({ queryKey: ["screen-groups"], queryFn: screenGroupService.list });

  const createGroup = useMutation({
    mutationFn: () =>
      screenGroupService.create({ name: newGroup.trim(), description: "", screenIds: [] }),
    onSuccess: (group) => {
      void qc.invalidateQueries({ queryKey: ["screen-groups"] });
      setNewGroup("");
      toast.success(`${group.name} created`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create group");
    },
  });

  const allScreens = useMemo(() => screensQuery.data ?? [], [screensQuery.data]);
  const screenGroups = groups.data ?? [];

  const rows = useMemo(() => {
    return allScreens.filter((s) => {
      if (debouncedSearch && !s.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
        return false;
      if (locationId !== "all" && s.locationId !== locationId) return false;
      if (status !== "all" && s.status !== status) return false;
      if (groupId !== "all" && !s.groupIds.includes(groupId)) return false;
      if (orientation !== "all" && s.orientation !== orientation) return false;
      return true;
    });
  }, [allScreens, debouncedSearch, locationId, status, groupId, orientation]);

  const statusCounts = useMemo(() => {
    const counts: Record<ScreenStatus | "all", number> = {
      all: allScreens.length,
      online: 0,
      syncing: 0,
      offline: 0,
      disabled: 0,
    };
    for (const screen of allScreens) counts[screen.status] += 1;
    return counts;
  }, [allScreens]);

  const filtersActive =
    Boolean(search) ||
    locationId !== "all" ||
    status !== "all" ||
    groupId !== "all" ||
    orientation !== "all";

  function clearFilters() {
    setSearch("");
    setLocationId("all");
    setStatus("all");
    setGroupId("all");
    setOrientation("all");
  }

  const columns: E3Column<Screen>[] = [
    {
      key: "name",
      header: "Screen",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {s.screenType} · {s.orientation}
          </p>
        </div>
      ),
    },
    { key: "location", header: "Location", cell: (s) => s.locationName },
    {
      key: "group",
      header: "Group",
      cell: (s) => groupLabel(s, screenGroups),
    },
    { key: "status", header: "Status", cell: (s) => <E3StatusBadge status={s.status} /> },
    { key: "playlist", header: "Playlist", cell: (s) => s.playlistName ?? "—" },
    {
      key: "playing",
      header: "Now playing",
      cell: (s) => (
        <span
          className="block max-w-[14rem] truncate text-muted-foreground"
          title={s.nowPlaying ?? undefined}
        >
          {s.nowPlaying ?? "—"}
        </span>
      ),
    },
    {
      key: "sync",
      header: "Sync",
      cell: (s) =>
        s.syncState === "Downloading" ? (
          <E3Progress value={s.syncProgress} className="w-28" label="" />
        ) : (
          <E3StatusBadge status={s.syncState} dot={false} />
        ),
    },
    {
      key: "seen",
      header: "Last seen",
      cell: (s) => <span className="tabular-nums text-muted-foreground">{s.lastSeen}</span>,
    },
    ...(canManageScreens
      ? ([
          {
            key: "actions",
            header: "Actions",
            className: "w-14 text-right",
            cell: (s: Screen) => <ScreenRowMenu screen={s} />,
          },
        ] as E3Column<Screen>[])
      : []),
  ];

  return (
    <div>
      <E3PageHeader
        title="Screens"
        description="Monitor pairing, playlist, sync and last heartbeat across every location."
        actions={
          <>
            <E3Button variant="outline" onClick={() => setGroupsOpen(true)}>
              Screen groups
            </E3Button>
            <E3Button variant="primary" onClick={() => setPairOpen(true)}>
              <Plus /> Add / Pair Screen
            </E3Button>
          </>
        }
      />

      <E3Card className="mb-5">
        <E3CardBody className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.4fr)_repeat(3,minmax(0,1fr))_auto]">
          <FilterField label="Search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Screen name"
                aria-label="Search screens"
                className="pl-9"
              />
            </div>
          </FilterField>
          <FilterField label="Location">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger aria-label="Filter by location">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.shortName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Group">
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger aria-label="Filter by group">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {screenGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Orientation">
            <Select value={orientation} onValueChange={setOrientation}>
              <SelectTrigger aria-label="Filter by orientation">
                <SelectValue placeholder="Orientation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="Landscape">Landscape</SelectItem>
                <SelectItem value="Portrait">Portrait</SelectItem>
                <SelectItem value="Portrait (upside down)">Portrait (upside down)</SelectItem>
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
                aria-label="Table view"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
                className={cn(
                  "grid size-10 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                  view === "table" && "bg-accent text-foreground",
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

      <E3QueryBoundary
        isLoading={screensQuery.isLoading}
        isError={screensQuery.isError}
        refetch={() => void screensQuery.refetch()}
        skeleton={view === "grid" ? <E3Skeletons count={6} /> : <ScreensTableSkeleton />}
      >
        {allScreens.length === 0 ? (
          <E3EmptyState
            icon={Monitor}
            title="No screens yet"
            description="Pair your first player to start publishing content."
            action={
              <E3Button variant="primary" onClick={() => setPairOpen(true)}>
                <Plus /> Add / Pair Screen
              </E3Button>
            }
          />
        ) : (
          <>
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
                    <span
                      className={cn("ml-1.5", selected ? "text-white/80" : "text-muted-foreground")}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm tabular-nums text-muted-foreground">
                {filtersActive
                  ? `${rows.length} of ${allScreens.length} screens`
                  : `${allScreens.length} screens`}
              </p>
              {filtersActive ? (
                <E3Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </E3Button>
              ) : null}
            </div>

            {rows.length === 0 ? (
              <E3EmptyState
                icon={Search}
                title="No screens match"
                description="Nothing matches these filters. Clear them to see the full list."
                action={
                  <E3Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </E3Button>
                }
              />
            ) : view === "table" ? (
              <E3Table
                columns={columns}
                rows={rows}
                rowKey={(s) => s.id}
                onRowClick={(s) => void navigate({ to: "/screens/$id", params: { id: s.id } })}
                caption="All paired screens"
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((s) => (
                  <E3ScreenCard
                    key={s.id}
                    screen={s}
                    overflow={canManageScreens ? <ScreenRowMenu screen={s} /> : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </E3QueryBoundary>

      <PairScreenDialog open={pairOpen} onOpenChange={setPairOpen} />

      <E3Modal
        open={groupsOpen}
        onOpenChange={setGroupsOpen}
        title="Screen groups"
        description="Groups let a campaign target many screens at once."
        className="sm:max-w-2xl"
        footer={
          <E3Button variant="outline" onClick={() => setGroupsOpen(false)}>
            Close
          </E3Button>
        }
      >
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="new-group">Create group</Label>
            <div className="flex gap-2">
              <Input
                id="new-group"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="e.g. All Cafe Screens"
              />
              <E3Button
                variant="primary"
                disabled={!newGroup.trim()}
                loading={createGroup.isPending}
                onClick={() => createGroup.mutate()}
              >
                Create
              </E3Button>
            </div>
          </div>
          {screenGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No groups yet. Create one to target many screens at once.
            </p>
          ) : (
            screenGroups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  {g.description ? (
                    <p className="truncate text-xs text-muted-foreground">{g.description}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {g.screenIds.length} screens
                </span>
              </div>
            ))
          )}
        </div>
      </E3Modal>

      <p className="mt-8 text-xs text-muted-foreground">
        Looking for a specific venue?{" "}
        <Link
          to="/locations"
          className="underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Browse locations
        </Link>
        .
      </p>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function groupLabel(screen: Screen, groups: ScreenGroup[]) {
  const names = groups.filter((g) => screen.groupIds.includes(g.id)).map((g) => g.name);
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

function ScreensTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card" aria-hidden>
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-3 w-44" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
