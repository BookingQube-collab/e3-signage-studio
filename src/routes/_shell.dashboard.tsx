import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CalendarClock,
  HardDrive,
  MapPin,
  Megaphone,
  Monitor,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  E3Alert,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3ErrorState,
  E3PageHeader,
  E3Progress,
  E3StatCard,
  E3StatusBadge,
} from "@/components/e3";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardService } from "@/services";

export const Route = createFileRoute("/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — E3 Digital Signage" },
      {
        name: "description",
        content: "Live overview of screens, sync state, campaigns and alerts across E3 locations.",
      },
      { property: "og:title", content: "Dashboard — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Live overview of screens, sync state, campaigns and alerts across E3 locations.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardService.summary,
  });

  return (
    <div>
      <E3PageHeader
        title="Dashboard"
        description="Network-wide status across every E3 location."
      />

      {isError ? <E3ErrorState onRetry={() => void refetch()} /> : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <E3StatCard label="Total Locations" value={data.locations} icon={MapPin} />
            <E3StatCard
              label="Total Screens"
              value={data.screens}
              icon={Monitor}
              highlight
              sublabel={`${data.online} online · ${data.syncing} syncing · ${data.offline} offline`}
            />
            <E3StatCard label="Online" value={data.online} icon={Wifi} tone="success" />
            <E3StatCard label="Offline" value={data.offline} icon={WifiOff} tone="danger" />
            <E3StatCard label="Syncing" value={data.syncing} icon={RefreshCw} tone="info" />
            <E3StatCard
              label="Active Campaigns"
              value={data.activeCampaigns}
              icon={Megaphone}
              tone="success"
            />
            <E3StatCard
              label="Scheduled Campaigns"
              value={data.scheduledCampaigns}
              icon={CalendarClock}
              tone="info"
            />
            <E3StatCard
              label="Storage Alerts"
              value={data.storageAlerts}
              icon={HardDrive}
              tone="warning"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <E3Card className="xl:col-span-2">
              <E3CardHeader
                title="Location status"
                description="Screens online per location"
                action={
                  <Link
                    to="/locations"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    View all
                  </Link>
                }
              />
              <E3CardBody className="space-y-4">
                {data.locationStatus.map((l) => {
                  const pct = l.total ? (l.online / l.total) * 100 : 0;
                  return (
                    <div key={l.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium">{l.name}</span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {l.online} / {l.total} online
                          </span>
                        </div>
                        <E3Progress
                          className="mt-2"
                          value={pct}
                          tone={pct === 100 ? "success" : pct > 60 ? "gradient" : "warning"}
                        />
                      </div>
                    </div>
                  );
                })}
              </E3CardBody>
            </E3Card>

            <E3Card>
              <E3CardHeader title="Alerts" description="Needs operational attention" />
              <E3CardBody className="space-y-3">
                {data.alerts.length === 0 ? (
                  <E3EmptyState title="No alerts" description="Everything is running normally." />
                ) : (
                  data.alerts.map((a) => (
                    <E3Alert
                      key={a.id}
                      severity={a.severity}
                      title={a.title}
                      detail={a.detail}
                      meta={a.at}
                    />
                  ))
                )}
              </E3CardBody>
            </E3Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <E3Card>
              <E3CardHeader title="Currently playing" description="Live content on active screens" />
              <E3CardBody className="space-y-3">
                {data.nowPlaying.length === 0 ? (
                  <E3EmptyState
                    title="Nothing playing"
                    description="No screen is currently reporting playback."
                  />
                ) : (
                  data.nowPlaying.map((s) => (
                    <Link
                      key={s.id}
                      to="/screens/$id"
                      params={{ id: s.id }}
                      className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                        <Monitor className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.locationName} · {s.nowPlaying}
                        </p>
                      </div>
                      <E3StatusBadge status={s.status} />
                    </Link>
                  ))
                )}
              </E3CardBody>
            </E3Card>

            <E3Card>
              <E3CardHeader title="Recent activity" description="Last 24 hours" />
              <E3CardBody>
                <ol className="space-y-4">
                  {data.activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <div className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-muted">
                        <Activity className="size-3.5 text-muted-foreground" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{a.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.detail} · {a.at}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </E3CardBody>
            </E3Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
