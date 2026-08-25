import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Megaphone, Plus } from "lucide-react";

import {
  E3Button,
  E3EmptyState,
  E3PageHeader,
  E3Progress,
  E3QueryBoundary,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { campaignService } from "@/services";
import type { Campaign } from "@/types";

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

function CampaignsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignService.list,
  });

  const columns: E3Column<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{c.contentName}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (c) => <E3StatusBadge status={c.status} /> },
    {
      key: "target",
      header: "Target",
      cell: (c) => `${c.locationIds.length} locations`,
    },
    { key: "start", header: "Start", cell: (c) => c.schedule.startDate },
    { key: "end", header: "End", cell: (c) => c.schedule.endDate },
    { key: "screens", header: "Screens", cell: (c) => c.screenIds.length },
    {
      key: "sync",
      header: "Sync",
      cell: (c) =>
        c.syncTotal === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <E3Progress
            className="w-28"
            value={(c.syncReady / c.syncTotal) * 100}
            label={`${c.syncReady}/${c.syncTotal}`}
          />
        ),
    },
  ];

  return (
    <div>
      <E3PageHeader
        title="Campaigns"
        description="Everything currently published or planned across the network."
        actions={
          <E3Button variant="primary" asChild>
            <Link to="/campaigns/new">
              <Plus /> New campaign
            </Link>
          </E3Button>
        }
      />

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {(data ?? []).length === 0 ? (
          <E3EmptyState
            icon={Megaphone}
            title="No active campaigns"
            description="Create a campaign to publish content to screens on a schedule."
            action={
              <E3Button variant="primary" asChild>
                <Link to="/campaigns/new">
                  <Plus /> New campaign
                </Link>
              </E3Button>
            }
          />
        ) : (
          <E3Table
            columns={columns}
            rows={data ?? []}
            rowKey={(c) => c.id}
            onRowClick={(c) => void navigate({ to: "/campaigns/$id", params: { id: c.id } })}
            caption="All campaigns"
          />
        )}
      </E3QueryBoundary>
    </div>
  );
}
