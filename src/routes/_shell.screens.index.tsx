import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, Monitor, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

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
import { PairScreenDialog } from "@/features/screens/PairScreenDialog";
import { cn } from "@/lib/utils";
import { locationService, screenGroupService, screenService } from "@/services";
import type { Screen } from "@/types";

export const Route = createFileRoute("/_shell/screens/")({
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

function ScreensPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"table" | "grid">("table");
  const [pairOpen, setPairOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("all");
  const [status, setStatus] = useState("all");
  const [groupId, setGroupId] = useState("all");
  const [orientation, setOrientation] = useState("all");

  const screensQuery = useQuery({ queryKey: ["screens"], queryFn: screenService.list });
  const locations = useQuery({ queryKey: ["locations"], queryFn: locationService.list });
  const groups = useQuery({ queryKey: ["screen-groups"], queryFn: screenGroupService.list });

  const rows = useMemo(() => {
    return (screensQuery.data ?? []).filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (locationId !== "all" && s.locationId !== locationId) return false;
      if (status !== "all" && s.status !== status) return false;
      if (groupId !== "all" && !s.groupIds.includes(groupId)) return false;
      if (orientation !== "all" && s.orientation !== orientation) return false;
      return true;
    });
  }, [screensQuery.data, search, locationId, status, groupId, orientation]);

  const columns: E3Column<Screen>[] = [
    {
      key: "name",
      header: "Screen",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.name}</p>
          <p className="truncate text-xs text-muted-foreground">{s.screenType}</p>
        </div>
      ),
    },
    { key: "location", header: "Location", cell: (s) => s.locationName },
    {
      key: "group",
      header: "Group",
      cell: (s) =>
        (groups.data ?? []).find((g) => s.groupIds.includes(g.id))?.name ?? "—",
    },
    { key: "status", header: "Status", cell: (s) => <E3StatusBadge status={s.status} /> },
    { key: "playlist", header: "Playlist", cell: (s) => s.playlistName ?? "—" },
    {
      key: "playing",
      header: "Now playing",
      cell: (s) => <span className="text-muted-foreground">{s.nowPlaying ?? "—"}</span>,
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
      cell: (s) => <span className="text-muted-foreground">{s.lastSeen}</span>,
    },
  ];

  return (
    <div>
      <E3PageHeader
        title="Screens"
        description="Every paired player across all locations."
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

      <E3Card className="mb-6">
        <E3CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search screen name"
              aria-label="Search screens"
              className="pl-9"
            />
          </div>
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
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="syncing">Syncing</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger aria-label="Filter by group">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {(groups.data ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Select value={orientation} onValueChange={setOrientation}>
              <SelectTrigger aria-label="Filter by orientation">
                <SelectValue placeholder="Orientation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="Landscape">Landscape</SelectItem>
                <SelectItem value="Portrait">Portrait</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex shrink-0 overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                aria-label="Table view"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
                className={cn("grid size-9 place-items-center", view === "table" && "bg-accent")}
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={cn("grid size-9 place-items-center", view === "grid" && "bg-accent")}
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
          </div>
        </E3CardBody>
      </E3Card>

      <E3QueryBoundary
        isLoading={screensQuery.isLoading}
        isError={screensQuery.isError}
        refetch={() => void screensQuery.refetch()}
      >
        {rows.length === 0 ? (
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
              <E3ScreenCard key={s.id} screen={s} />
            ))}
          </div>
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
              <Input id="new-group" placeholder="e.g. All Cafe Screens" />
              <E3Button variant="primary">Create</E3Button>
            </div>
          </div>
          {(groups.data ?? []).map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{g.name}</p>
                <p className="truncate text-xs text-muted-foreground">{g.description}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {g.screenIds.length} screens
              </span>
            </div>
          ))}
        </div>
      </E3Modal>

      <p className="mt-6 text-xs text-muted-foreground">
        Looking for a specific venue?{" "}
        <Link to="/locations" className="underline underline-offset-4">
          Browse locations
        </Link>
        .
      </p>
    </div>
  );
}
