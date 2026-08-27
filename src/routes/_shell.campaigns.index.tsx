import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Megaphone, Plus, Repeat } from "lucide-react";

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
import { CampaignRowMenu } from "@/features/campaigns/CampaignRowMenu";
import {
  effectiveCampaignStatus,
  formatCampaignDateTime,
  isDatedSchedule,
  isEvergreenSchedule,
} from "@/lib/campaign-window";
import { campaignService, locationService } from "@/services";
import type { Campaign, Location } from "@/types";

export const Route = createFileRoute("/_shell/campaigns/")({
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

function CampaignsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignService.list,
  });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: locationService.list });

  const campaigns = Array.isArray(data) ? data : [];
  const locations = Array.isArray(locationsQuery.data) ? locationsQuery.data : [];
  const scheduled = campaigns.filter((c) => isDatedSchedule(c.schedule));
  const ongoing = campaigns.filter((c) => isEvergreenSchedule(c.schedule));
  const other = campaigns.filter((c) => !isDatedSchedule(c.schedule) && !isEvergreenSchedule(c.schedule));

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

  return (
    <div>
      <E3PageHeader
        title="Campaigns"
        description="Scheduled campaigns have dates. Ongoing campaigns loop until you pause or archive them."
        actions={
          <E3Button variant="primary" asChild>
            <Link to="/campaigns/new" search={{}}>
              <Plus /> New campaign
            </Link>
          </E3Button>
        }
      />

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
        ) : (
          <div className="space-y-8">
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Scheduled</h2>
              <p className="text-sm text-muted-foreground">
                Campaigns with a start and end date. These also appear on the Schedule calendar.
              </p>
              {scheduled.length === 0 ? (
                <E3EmptyState
                  title="No dated campaigns"
                  description="Publish a campaign with start and end dates to fill this list and the calendar."
                />
              ) : (
                <E3Table
                  columns={scheduledColumns}
                  rows={scheduled}
                  rowKey={(c) => c.id}
                  onRowClick={openCampaign}
                  caption="Scheduled campaigns"
                />
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Ongoing / always-on</h2>
              <p className="text-sm text-muted-foreground">
                No start or end date. Listed by location — they are not shown on the Schedule calendar.
              </p>
              {ongoing.length === 0 ? (
                <E3EmptyState
                  icon={Repeat}
                  title="No ongoing campaigns"
                  description="Choose Ongoing (no dates) when creating a campaign for looping content that should always play."
                />
              ) : (
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
              )}
            </section>

            {other.length > 0 ? (
              <E3Table
                columns={scheduledColumns}
                rows={other}
                rowKey={(c) => c.id}
                onRowClick={openCampaign}
                caption="Other campaigns"
              />
            ) : null}
          </div>
        )}
      </E3QueryBoundary>
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
