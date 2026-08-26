import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Monitor } from "lucide-react";

import {
  E3Alert,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3PageHeader,
  E3QueryBoundary,
  E3ScreenCard,
  E3StatCard,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { campaignService, locationService, screenService } from "@/services";
import type { Campaign } from "@/types";

export const Route = createFileRoute("/_shell/locations/$id")({
  head: () => ({
    meta: [
      { title: "Location — E3 Digital Signage" },
      { name: "description", content: "Screens, campaigns and activity for one E3 location." },
      { property: "og:title", content: "Location — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Screens, campaigns and activity for one E3 location.",
      },
    ],
  }),
  component: LocationDetailPage,
});

function LocationDetailPage() {
  const { id } = Route.useParams();

  const locationQuery = useQuery({
    queryKey: ["location", id],
    queryFn: () => locationService.get(id),
  });
  const screensQuery = useQuery({
    queryKey: ["screens", "location", id],
    queryFn: () => screenService.listByLocation(id),
  });
  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: campaignService.list });

  const location = locationQuery.data;
  const screens = screensQuery.data ?? [];
  const campaigns = (campaignsQuery.data ?? []).filter((c) => c.locationIds.includes(id));
  const online = screens.filter((s) => s.status === "online").length;

  const campaignColumns: E3Column<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      cell: (c) => (
        <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">
          {c.name}
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (c) => <E3StatusBadge status={c.status} /> },
    { key: "content", header: "Content", cell: (c) => c.contentName },
    {
      key: "dates",
      header: "Window",
      cell: (c) => `${c.schedule.startDate} → ${c.schedule.endDate}`,
    },
  ];

  return (
    <div>
      <E3QueryBoundary
        isLoading={locationQuery.isLoading}
        isError={locationQuery.isError}
        refetch={() => void locationQuery.refetch()}
      >
        {!location ? (
          <E3EmptyState title="Location not found" description="This location may have been removed." />
        ) : (
          <>
            <E3PageHeader
              breadcrumb={
                <Link to="/locations" className="hover:text-foreground">
                  ← All locations
                </Link>
              }
              title={location.name}
              description={`${location.type} · ${location.city}`}
              actions={<E3StatusBadge status={location.status} />}
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <E3StatCard label="Screens" value={screens.length} icon={Monitor} />
              <E3StatCard label="Online" value={online} tone="success" />
              <E3StatCard
                label="Offline"
                value={screens.filter((s) => s.status === "offline").length}
                tone="danger"
              />
              <E3StatCard label="Active campaigns" value={location.activeCampaigns} highlight />
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="mb-5 flex-wrap">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="screens">Screens</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-2">
                  <E3Card>
                    <E3CardHeader title="Screen health" />
                    <E3CardBody className="space-y-3">
                      {screens.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{s.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {s.nowPlaying ?? "Nothing playing"}
                            </p>
                          </div>
                          <E3StatusBadge status={s.status} />
                        </div>
                      ))}
                    </E3CardBody>
                  </E3Card>
                  <E3Card>
                    <E3CardHeader title="Operational notes" />
                    <E3CardBody className="space-y-3">
                      <E3Alert
                        severity="info"
                        title="Content defaults"
                        detail="Screens inherit the location playlist unless a campaign overrides it."
                      />
                      <E3Alert
                        severity="warning"
                        title="Verify before events"
                        detail="Run a manual sync on all screens 24 hours before an event opens."
                      />
                    </E3CardBody>
                  </E3Card>
                </div>
              </TabsContent>

              <TabsContent value="screens">
                {screens.length === 0 ? (
                  <E3EmptyState
                    icon={Monitor}
                    title="No screens yet"
                    description="Pair a screen from the Screens page to attach it to this location."
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {screens.map((s) => (
                      <E3ScreenCard key={s.id} screen={s} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="campaigns">
                {campaigns.length === 0 ? (
                  <E3EmptyState
                    title="No active campaigns"
                    description="This location is not currently targeted by any campaign."
                  />
                ) : (
                  <E3Table columns={campaignColumns} rows={campaigns} rowKey={(c) => c.id} />
                )}
              </TabsContent>

              <TabsContent value="schedule">
                <E3Card>
                  <E3CardHeader title="Scheduled windows" />
                  <E3CardBody className="space-y-3">
                    {campaigns.length === 0 ? (
                      <E3EmptyState title="Nothing scheduled" />
                    ) : (
                      campaigns.map((c) => (
                        <div
                          key={c.id}
                          className="grid gap-1 rounded-xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.schedule.days.join(" ")} · {c.schedule.startTime}–
                              {c.schedule.endTime} {c.schedule.timezone}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {c.schedule.startDate} → {c.schedule.endDate}
                          </p>
                        </div>
                      ))
                    )}
                  </E3CardBody>
                </E3Card>
              </TabsContent>

              <TabsContent value="activity">
                <E3Card>
                  <E3CardHeader title="Recent activity" />
                  <E3CardBody>
                    <ol className="space-y-4 text-sm">
                      {screens.slice(0, 5).map((s) => (
                        <li key={s.id} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {s.name} — {s.syncState === "Ready" || s.syncState === "Active" ? "synchronized" : s.syncState}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{s.lastSync}</span>
                        </li>
                      ))}
                    </ol>
                  </E3CardBody>
                </E3Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </E3QueryBoundary>
    </div>
  );
}
