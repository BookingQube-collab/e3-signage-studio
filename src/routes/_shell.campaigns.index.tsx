import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, LayoutGrid, List, Megaphone, Plus, Repeat, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3PageHeader,
  E3Progress,
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
import { CampaignRowMenu } from "@/features/campaigns/CampaignRowMenu";
import {
  effectiveCampaignStatus,
  formatCampaignDateTime,
  isDatedSchedule,
  isEvergreenSchedule,
} from "@/lib/campaign-window";
import { toCsv } from "@/lib/monitoring";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasQueryClientContext } from "@/lib/router-preload";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useViewPreference } from "@/lib/view-preference";
import { cn } from "@/lib/utils";
import { campaignService, locationService } from "@/services";
import type { Campaign, CampaignStatus, Location } from "@/types";

const CAMPAIGN_VIEWS = ["list", "grid"] as const;

export const Route = createFileRoute("/_shell/campaigns/")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/campaigns");
  },
  head: () => ({
    meta: [
      { title: "Campaigns — E3 Digital Signage" },
      {
        name: "description",
        content: "Plan, target, schedule and publish content campaigns across E3 screens.",
      },
      { property: "og:title", content: "Campaigns — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Plan, target, schedule and publish content campaigns across E3 screens.",
      },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Scheduled", label: "Scheduled" },
  { value: "Paused", label: "Paused" },
  { value: "Ended", label: "Ended" },
  { value: "Draft", label: "Draft" },
  { value: "Archived", label: "Archived" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];
type TypeFilter = "all" | "scheduled" | "ongoing";

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function campaignType(c: Campaign): "scheduled" | "ongoing" | "other" {
  if (isDatedSchedule(c.schedule)) return "scheduled";
  if (isEvergreenSchedule(c.schedule)) return "ongoing";
  return "other";
}

function campaignOverlapsDateRange(c: Campaign, dateFrom: string, dateTo: string): boolean {
  if (!isDatedSchedule(c.schedule)) return !dateFrom && !dateTo;
  const start = c.schedule.startDate;
  const end = c.schedule.endDate;
  if (dateFrom && end < dateFrom) return false;
  if (dateTo && start > dateTo) return false;
  return true;
}

function campaignNameCell(c: Campaign) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{c.name}</p>
      <p className="truncate text-xs text-muted-foreground">{c.contentName}</p>
    </div>
  );
}

function syncCell(c: Campaign) {
  return c.syncTotal === 0 ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <E3Progress
      className="w-28"
      value={(c.syncReady / c.syncTotal) * 100}
      label={`${c.syncReady}/${c.syncTotal}`}
    />
  );
}

function locationNamesFor(c: Campaign, locations: Location[]): string {
  const names = locations
    .filter((l) => (c.locationIds ?? []).includes(l.id))
    .map((l) => l.shortName || l.name);
  return names.length > 0 ? names.join("; ") : "";
}

function CampaignsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignService.list,
  });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: locationService.list });

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [locationId, setLocationId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useViewPreference("campaigns", CAMPAIGN_VIEWS, "list");

  const campaigns = Array.isArray(data) ? data : [];
  const locations = Array.isArray(locationsQuery.data) ? locationsQuery.data : [];

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q) {
        const hay = `${c.name} ${c.contentName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const kind = campaignType(c);
      if (type === "scheduled" && kind !== "scheduled") return false;
      if (type === "ongoing" && kind !== "ongoing") return false;

      if (status !== "all") {
        const effective = effectiveCampaignStatus(c.status, c.schedule);
        if (effective !== status) return false;
      }

      if (locationId !== "all" && !(c.locationIds ?? []).includes(locationId)) return false;

      if (dateFrom || dateTo) {
        if (kind === "ongoing") return false;
        if (!campaignOverlapsDateRange(c, dateFrom, dateTo)) return false;
      }

      return true;
    });
  }, [campaigns, debouncedSearch, type, status, locationId, dateFrom, dateTo]);

  const scheduled = filtered.filter((c) => isDatedSchedule(c.schedule));
  const ongoing = filtered.filter((c) => isEvergreenSchedule(c.schedule));
  const other = filtered.filter((c) => !isDatedSchedule(c.schedule) && !isEvergreenSchedule(c.schedule));

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: campaigns.length,
      Active: 0,
      Scheduled: 0,
      Paused: 0,
      Ended: 0,
      Draft: 0,
      Archived: 0,
    };
    for (const c of campaigns) {
      const effective = effectiveCampaignStatus(c.status, c.schedule) as CampaignStatus;
      if (effective in counts) counts[effective as Exclude<StatusFilter, "all">] += 1;
    }
    return counts;
  }, [campaigns]);

  const filtersActive =
    Boolean(search) ||
    status !== "all" ||
    type !== "all" ||
    locationId !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setType("all");
    setLocationId("all");
    setDateFrom("");
    setDateTo("");
  }

  function exportCampaigns() {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      "e3-campaigns.csv",
      [
        "Name",
        "Content",
        "Status",
        "Type",
        "Locations",
        "Start",
        "End",
        "Screens",
        "Sync ready",
        "Sync total",
      ],
      filtered.map((c) => {
        const kind = campaignType(c);
        return [
          c.name,
          c.contentName ?? "",
          effectiveCampaignStatus(c.status, c.schedule),
          kind === "scheduled" ? "Scheduled" : kind === "ongoing" ? "Ongoing" : "Other",
          locationNamesFor(c, locations),
          kind === "scheduled"
            ? formatCampaignDateTime(c.schedule?.startDate, c.schedule?.startTime, c.schedule?.timezone)
            : "—",
          kind === "scheduled"
            ? formatCampaignDateTime(c.schedule?.endDate, c.schedule?.endTime, c.schedule?.timezone)
            : "—",
          String((c.screenIds ?? []).length),
          String(c.syncReady),
          String(c.syncTotal),
        ];
      }),
    );
    toast.success(`Exported ${filtered.length} campaign${filtered.length === 1 ? "" : "s"}`);
  }

  const scheduledColumns: E3Column<Campaign>[] = [
    { key: "name", header: "Campaign", cell: campaignNameCell },
    {
      key: "status",
      header: "Status",
      cell: (c) => <E3StatusBadge status={effectiveCampaignStatus(c.status, c.schedule)} />,
    },
    {
      key: "target",
      header: "Target",
      cell: (c) => `${(c.locationIds ?? []).length} locations`,
    },
    {
      key: "start",
      header: "Start",
      cell: (c) =>
        formatCampaignDateTime(c.schedule?.startDate, c.schedule?.startTime, c.schedule?.timezone),
    },
    {
      key: "end",
      header: "End",
      cell: (c) => formatCampaignDateTime(c.schedule?.endDate, c.schedule?.endTime, c.schedule?.timezone),
    },
    { key: "screens", header: "Screens", cell: (c) => (c.screenIds ?? []).length },
    { key: "sync", header: "Sync", cell: syncCell },
    {
      key: "actions",
      header: "Actions",
      className: "w-14 text-right",
      cell: (c) => <CampaignRowMenu campaign={c} />,
    },
  ];

  const ongoingColumns: E3Column<Campaign>[] = [
    { key: "name", header: "Campaign", cell: campaignNameCell },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <E3StatusBadge status="Ongoing" />
          <E3StatusBadge status={effectiveCampaignStatus(c.status, c.schedule)} />
        </span>
      ),
    },
    { key: "screens", header: "Screens", cell: (c) => (c.screenIds ?? []).length },
    { key: "sync", header: "Sync", cell: syncCell },
    {
      key: "actions",
      header: "Actions",
      className: "w-14 text-right",
      cell: (c) => <CampaignRowMenu campaign={c} />,
    },
  ];

  const ongoingGroups = locations
    .map((location) => ({
      location,
      campaigns: ongoing.filter((c) => (c.locationIds ?? []).includes(location.id)),
    }))
    .filter((g) => g.campaigns.length > 0);
  const unassignedOngoing = ongoing.filter((c) => (c.locationIds ?? []).length === 0);

  function openCampaign(c: Campaign) {
    void navigate({ to: "/campaigns/$id", params: { id: c.id } });
  }

  const showScheduledSection = type !== "ongoing";
  const showOngoingSection = type !== "scheduled" && !dateFrom && !dateTo;

  return (
    <div>
      <E3PageHeader
        title="Campaigns"
        description="Scheduled campaigns have dates. Ongoing campaigns loop until you pause or archive them."
        actions={
          <>
            <E3Button variant="outline" onClick={exportCampaigns} disabled={campaigns.length === 0}>
              <Download /> Export CSV
            </E3Button>
            <E3Button variant="primary" asChild>
              <Link to="/campaigns/new" search={{}}>
                <Plus /> New campaign
              </Link>
            </E3Button>
          </>
        }
      />

      <E3Card className="mb-5">
        <E3CardBody className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
          <FilterField label="Search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Campaign or content name"
                aria-label="Search campaigns"
                className="pl-9"
              />
            </div>
          </FilterField>
          <FilterField label="Type">
            <Select value={type} onValueChange={(v) => setType(v as TypeFilter)}>
              <SelectTrigger aria-label="Filter by type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Location">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger aria-label="Filter by location">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.shortName || l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="From date">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Filter campaigns overlapping from date"
            />
          </FilterField>
          <FilterField label="To date">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Filter campaigns overlapping to date"
            />
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
              className={
                selected
                  ? "e3-gradient rounded-full border border-transparent px-3.5 py-1.5 text-sm tabular-nums text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                  : "rounded-full border border-border px-3.5 py-1.5 text-sm tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              }
            >
              {item.label}
              <span className={selected ? "ml-1.5 text-white/80" : "ml-1.5 text-muted-foreground"}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-muted-foreground">
          {filtersActive
            ? `${filtered.length} of ${campaigns.length} campaigns`
            : `${campaigns.length} campaigns`}
        </p>
        {filtersActive ? (
          <E3Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </E3Button>
        ) : null}
      </div>

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {campaigns.length === 0 ? (
          <E3EmptyState
            icon={Megaphone}
            title="No active campaigns"
            description="Create a campaign to publish content to screens on a schedule, or as always-on looping content."
            action={
              <E3Button variant="primary" asChild>
                <Link to="/campaigns/new" search={{}}>
                  <Plus /> New campaign
                </Link>
              </E3Button>
            }
          />
        ) : filtered.length === 0 ? (
          <E3EmptyState
            icon={Search}
            title="No campaigns match"
            description="Nothing matches these filters. Clear them to see the full list."
            action={
              <E3Button variant="outline" onClick={clearFilters}>
                Clear filters
              </E3Button>
            }
          />
        ) : (
          <div className="space-y-8">
            {showScheduledSection ? (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold">Scheduled</h2>
                <p className="text-sm text-muted-foreground">
                  Campaigns with a start and end date. These also appear on the Schedule calendar.
                </p>
                {scheduled.length === 0 ? (
                  <E3EmptyState
                    title="No dated campaigns"
                    description={
                      filtersActive
                        ? "No scheduled campaigns match the current filters."
                        : "Publish a campaign with start and end dates to fill this list and the calendar."
                    }
                  />
                ) : view === "list" ? (
                  <E3Table
                    columns={scheduledColumns}
                    rows={scheduled}
                    rowKey={(c) => c.id}
                    onRowClick={openCampaign}
                    caption="Scheduled campaigns"
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {scheduled.map((c) => (
                      <CampaignCard
                        key={c.id}
                        campaign={c}
                        locations={locations}
                        variant="scheduled"
                        overflow={<CampaignRowMenu campaign={c} />}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {showOngoingSection ? (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-semibold">Ongoing / always-on</h2>
                <p className="text-sm text-muted-foreground">
                  No start or end date. Listed by location — they are not shown on the Schedule calendar.
                </p>
                {ongoing.length === 0 ? (
                  <E3EmptyState
                    icon={Repeat}
                    title="No ongoing campaigns"
                    description={
                      filtersActive
                        ? "No ongoing campaigns match the current filters."
                        : "Choose Ongoing (no dates) when creating a campaign for looping content that should always play."
                    }
                  />
                ) : view === "list" ? (
                  <div className="space-y-4">
                    {ongoingGroups.map(({ location, campaigns: rows }) => (
                      <OngoingLocationGroup
                        key={location.id}
                        location={location}
                        rows={rows}
                        columns={ongoingColumns}
                        onRowClick={openCampaign}
                      />
                    ))}
                    {unassignedOngoing.length > 0 ? (
                      <OngoingLocationGroup
                        location={null}
                        rows={unassignedOngoing}
                        columns={ongoingColumns}
                        onRowClick={openCampaign}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {ongoing.map((c) => (
                      <CampaignCard
                        key={c.id}
                        campaign={c}
                        locations={locations}
                        variant="ongoing"
                        overflow={<CampaignRowMenu campaign={c} />}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {other.length > 0 ? (
              view === "list" ? (
                <E3Table
                  columns={scheduledColumns}
                  rows={other}
                  rowKey={(c) => c.id}
                  onRowClick={openCampaign}
                  caption="Other campaigns"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {other.map((c) => (
                    <CampaignCard
                      key={c.id}
                      campaign={c}
                      locations={locations}
                      variant="scheduled"
                      overflow={<CampaignRowMenu campaign={c} />}
                    />
                  ))}
                </div>
              )
            ) : null}
          </div>
        )}
      </E3QueryBoundary>
    </div>
  );
}

function CampaignCard({
  campaign,
  locations,
  variant,
  overflow,
}: {
  campaign: Campaign;
  locations: Location[];
  variant: "scheduled" | "ongoing";
  overflow?: ReactNode;
}) {
  const effective = effectiveCampaignStatus(campaign.status, campaign.schedule);
  const locationLabel = locationNamesFor(campaign, locations);
  const screenCount = (campaign.screenIds ?? []).length;
  const syncPct =
    campaign.syncTotal === 0 ? 0 : (campaign.syncReady / campaign.syncTotal) * 100;

  return (
    <div className="relative rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-e3-purple/40 hover:shadow-md">
      <Link
        to="/campaigns/$id"
        params={{ id: campaign.id }}
        className="block rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-28 items-center justify-center rounded-xl bg-gradient-to-br from-e3-purple/15 via-muted to-e3-orange/10">
          <Megaphone className="size-10 text-e3-purple/70" aria-hidden />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display truncate text-lg font-semibold tracking-tight">
              {campaign.name || "Untitled"}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {campaign.contentType}: {campaign.contentName || "—"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {variant === "ongoing" ? <E3StatusBadge status="Ongoing" /> : null}
            <E3StatusBadge status={effective} />
          </div>
        </div>
        <div className="mt-3 space-y-2 text-xs tabular-nums text-muted-foreground">
          <p>
            {screenCount} screen{screenCount === 1 ? "" : "s"}
            {locationLabel ? ` · ${locationLabel}` : ""}
          </p>
          {variant === "scheduled" && isDatedSchedule(campaign.schedule) ? (
            <p>
              {formatCampaignDateTime(
                campaign.schedule.startDate,
                campaign.schedule.startTime,
                campaign.schedule.timezone,
              )}{" "}
              →{" "}
              {formatCampaignDateTime(
                campaign.schedule.endDate,
                campaign.schedule.endTime,
                campaign.schedule.timezone,
              )}
            </p>
          ) : null}
          {campaign.syncTotal > 0 ? (
            <E3Progress
              className="w-full"
              value={syncPct}
              label={`${campaign.syncReady}/${campaign.syncTotal}`}
            />
          ) : (
            <p>Modified {campaign.modifiedAt || "—"}</p>
          )}
        </div>
      </Link>
      {overflow ? <div className="absolute right-3 top-3 z-10">{overflow}</div> : null}
    </div>
  );
}

function OngoingLocationGroup({
  location,
  rows,
  columns,
  onRowClick,
}: {
  location: Location | null;
  rows: Campaign[];
  columns: E3Column<Campaign>[];
  onRowClick: (c: Campaign) => void;
}) {
  const title = location?.name ?? "No location";
  const description = location
    ? `${location.shortName} · ${rows.length} campaign${rows.length === 1 ? "" : "s"}`
    : "Not targeted at a location yet";
  return (
    <E3Card>
      <E3CardHeader title={title} description={description} />
      <E3CardBody className="p-0">
        <E3Table
          className="rounded-none border-0"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={onRowClick}
          caption={`${title} ongoing campaigns`}
        />
      </E3CardBody>
    </E3Card>
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
