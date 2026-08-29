import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Megaphone, Monitor, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  E3Alert,
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3Modal,
  E3PageHeader,
  E3QueryBoundary,
  E3ScreenCard,
  E3StatCard,
  E3StatusBadge,
  E3Table,
  type E3Column,
} from "@/components/e3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignRowMenu } from "@/features/campaigns/CampaignRowMenu";
import { LocationFormDialog } from "@/features/locations/LocationFormDialog";
import { PairScreenDialog } from "@/features/screens/PairScreenDialog";
import { ScreenRowMenu } from "@/features/screens/ScreenRowMenu";
import {
  effectiveCampaignStatus,
  formatCampaignWindowLabel,
  isDatedSchedule,
} from "@/lib/campaign-window";
import { campaignService, locationService, screenService } from "@/services";
import { NO_LOCATION_ACCESS_MESSAGE } from "@/lib/location-scope";
import { invalidateKeysInBackground, writeEntityCache } from "@/lib/query-cache";
import { hasPermission } from "@/lib/rbac";
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
  const { auth } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = auth?.ok ? auth.profile.role : null;
  const canManageLocations = role === "SUPER_ADMIN";
  const canPairScreens = Boolean(role && hasPermission(role, "screens.manage"));
  const canManageCampaigns = Boolean(role && hasPermission(role, "campaigns.manage"));

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);

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
  const datedCampaigns = campaigns.filter((c) => isDatedSchedule(c.schedule));
  const online = screens.filter((s) => s.status === "online").length;

  const update = useMutation({
    mutationFn: (input: Parameters<typeof locationService.update>[1]) =>
      locationService.update(id, input),
    onSuccess: (loc) => {
      writeEntityCache(qc, {
        detailKey: ["location", id],
        listKey: ["locations"],
        entity: loc,
      });
      toast.success(`${loc.name} updated`);
      setEditOpen(false);
      invalidateKeysInBackground(qc, [["location", id], ["locations"]]);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not update location");
    },
  });

  const remove = useMutation({
    mutationFn: () => locationService.remove(id),
    onSuccess: () => {
      invalidateKeysInBackground(qc, [["locations"], ["screens"], ["dashboard"]]);
      toast.success(`${location?.name ?? "Location"} deleted`);
      setDeleteOpen(false);
      void navigate({ to: "/locations" });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not delete location");
    },
  });

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
    {
      key: "status",
      header: "Status",
      cell: (c) => <E3StatusBadge status={effectiveCampaignStatus(c.status, c.schedule)} />,
    },
    { key: "content", header: "Content", cell: (c) => c.contentName },
    {
      key: "dates",
      header: "Window",
      cell: (c) => formatCampaignWindowLabel(c.schedule),
    },
    ...(canManageCampaigns
      ? ([
          {
            key: "actions",
            header: "Actions",
            className: "w-14 text-right",
            cell: (c: Campaign) => <CampaignRowMenu campaign={c} />,
          },
        ] as E3Column<Campaign>[])
      : []),
  ];

  const addCampaignButton = (size: "sm" | "md" = "md") =>
    canManageCampaigns ? (
      <E3Button variant="primary" size={size} asChild>
        <Link to="/campaigns/new" search={{ locationId: id }}>
          <Plus /> New campaign
        </Link>
      </E3Button>
    ) : null;

  return (
    <div>
      <E3QueryBoundary
        isLoading={locationQuery.isLoading}
        isError={locationQuery.isError}
        refetch={() => void locationQuery.refetch()}
      >
        {!location ? (
          <E3EmptyState
            title={NO_LOCATION_ACCESS_MESSAGE}
            description="This location is not in your assigned list, or it may have been removed."
          />
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
              actions={
                <>
                  <E3StatusBadge status={location.status} className="self-center" />
                  {canManageLocations ? (
                    <>
                      <E3Button variant="outline" onClick={() => setEditOpen(true)}>
                        <Pencil /> Edit
                      </E3Button>
                      <E3Button variant="danger" onClick={() => setDeleteOpen(true)}>
                        <Trash2 /> Delete
                      </E3Button>
                    </>
                  ) : null}
                </>
              }
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
                      {screens.length === 0 ? (
                        <E3EmptyState
                          icon={Monitor}
                          title="No screens yet"
                          description="Pair a screen to this location to see health here."
                          action={
                            canPairScreens ? (
                              <E3Button variant="primary" onClick={() => setPairOpen(true)}>
                                <Plus /> Add / Pair Screen
                              </E3Button>
                            ) : undefined
                          }
                        />
                      ) : (
                        screens.map((s) => (
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
                        ))
                      )}
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

              <TabsContent value="screens" className="space-y-4">
                {screens.length === 0 ? (
                  <E3EmptyState
                    icon={Monitor}
                    title="No screens yet"
                    description="Pair a player to this location. You can still add screens from the Screens page later."
                    action={
                      canPairScreens ? (
                        <E3Button variant="primary" onClick={() => setPairOpen(true)}>
                          <Plus /> Add / Pair Screen
                        </E3Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    {canPairScreens ? (
                      <div className="flex justify-end">
                        <E3Button variant="primary" onClick={() => setPairOpen(true)}>
                          <Plus /> Add / Pair Screen
                        </E3Button>
                      </div>
                    ) : null}
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {screens.map((s) => (
                        <E3ScreenCard
                          key={s.id}
                          screen={s}
                          overflow={canPairScreens ? <ScreenRowMenu screen={s} /> : undefined}
                        />
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="campaigns" className="space-y-4">
                {campaigns.length === 0 ? (
                  <E3EmptyState
                    icon={Megaphone}
                    title="No active campaigns"
                    description="Create a campaign targeted at this location to publish content here."
                    action={addCampaignButton()}
                  />
                ) : (
                  <>
                    {canManageCampaigns ? (
                      <div className="flex justify-end">{addCampaignButton()}</div>
                    ) : null}
                    <E3Table columns={campaignColumns} rows={campaigns} rowKey={(c) => c.id} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="schedule">
                <E3Card>
                  <E3CardHeader title="Scheduled windows" action={addCampaignButton("sm")} />
                  <E3CardBody className="space-y-3">
                    {datedCampaigns.length === 0 ? (
                      <E3EmptyState
                        title="Nothing scheduled"
                        description="Dated campaigns appear here. Ongoing / always-on campaigns are on the Campaigns tab."
                      />
                    ) : (
                      datedCampaigns.map((c) => (
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
                            {s.name} —{" "}
                            {s.syncState === "Ready" || s.syncState === "Active"
                              ? "synchronized"
                              : s.syncState}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {s.lastSync}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </E3CardBody>
                </E3Card>
              </TabsContent>
            </Tabs>

            <LocationFormDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              title="Edit location"
              description="Update the venue name, type or status."
              submitLabel="Save changes"
              location={location}
              pending={update.isPending}
              onSubmit={(form) =>
                update.mutate({
                  name: form.name,
                  shortName: location.shortName === location.name ? form.name : location.shortName,
                  type: form.type,
                  status: form.status,
                  city: form.city || "Doha",
                  screenCount: location.screenCount,
                  onlineCount: location.onlineCount,
                  activeCampaigns: location.activeCampaigns,
                })
              }
            />

            <E3Modal
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!open && remove.isPending) return;
                setDeleteOpen(open);
              }}
              title={`Delete ${location.name}?`}
              description={
                screens.length > 0
                  ? `Unpair the ${screens.length} screen${screens.length === 1 ? "" : "s"} at this location before deleting it.`
                  : "This removes the location from the CMS. This cannot be undone."
              }
              footer={
                <>
                  <E3Button
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => setDeleteOpen(false)}
                  >
                    Cancel
                  </E3Button>
                  <E3Button
                    variant="danger"
                    disabled={screens.length > 0}
                    loading={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Delete location
                  </E3Button>
                </>
              }
            />

            <PairScreenDialog open={pairOpen} onOpenChange={setPairOpen} defaultLocationId={id} />
          </>
        )}
      </E3QueryBoundary>
    </div>
  );
}
