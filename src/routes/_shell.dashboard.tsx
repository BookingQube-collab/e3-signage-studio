import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardService } from "@/services";
import {
  adminMonitoringRefetchInterval,
  formatCloudStorageUsage,
  formatStorageBytes,
} from "@/lib/monitoring";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasQueryClientContext } from "@/lib/router-preload";
import { useIsClient } from "@/lib/use-is-client";
import { useLiveMonitoring } from "@/lib/use-live-monitoring";
import { cn } from "@/lib/utils";
import type { DashboardSummary } from "@/services/types";

export const Route = createFileRoute("/_shell/dashboard")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/dashboard");
  },
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

const fleetConfig = {
  online: { label: "Online", color: "var(--success)" },
  offline: { label: "Offline", color: "var(--destructive)" },
  syncing: { label: "Syncing", color: "var(--info)" },
} satisfies ChartConfig;

const locationConfig = {
  online: { label: "Online", color: "var(--chart-3)" },
  offline: { label: "Offline", color: "var(--chart-5)" },
} satisfies ChartConfig;

const FLEET_COLORS = {
  online: "var(--success)",
  offline: "var(--destructive)",
  syncing: "var(--info)",
} as const;

function shortLabel(value: string, max = 14): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function DashboardPage() {
  const isClient = useIsClient();
  const { data, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardService.summary,
    enabled: isClient,
    refetchInterval: adminMonitoringRefetchInterval,
    refetchIntervalInBackground: false,
  });
  useLiveMonitoring([["dashboard"], ["screens"]]);

  return (
    <div>
      <E3PageHeader
        title="Dashboard"
        description="Network-wide status across every E3 location."
      />

      {isError && !data ? <E3ErrorState onRetry={() => void refetch()} /> : null}

      {!data && !isError ? <DashboardSkeleton /> : null}

      {data ? <DashboardBody data={data} /> : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl xl:col-span-2" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl xl:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardSummary }) {
  const fleetSlices = [
    { key: "online" as const, name: "Online", value: data.online },
    { key: "offline" as const, name: "Offline", value: data.offline },
    { key: "syncing" as const, name: "Syncing", value: data.syncing },
  ].filter((s) => s.value > 0);

  const fleetChartData =
    fleetSlices.length > 0
      ? fleetSlices
      : [{ key: "offline" as const, name: "No screens", value: 1 }];

  const onlinePct = data.screens ? Math.round((data.online / data.screens) * 100) : 0;

  const locationBars = data.locationStatus
    .map((l) => ({
      name: l.name,
      online: l.online,
      offline: Math.max(0, l.total - l.online),
      total: l.total,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const storagePct =
    data.cloudStorage && data.cloudStorage.totalBytes > 0
      ? Math.min(100, (data.cloudStorage.usedBytes / data.cloudStorage.totalBytes) * 100)
      : 0;
  const storageTone =
    data.storageAlerts > 0 ? "warning" : storagePct >= 70 ? "warning" : "gradient";

  const criticalAlerts = data.alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/80 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Live monitoring</span>
        {" — "}
        fleet connectivity, sync events and Cloudflare R2 usage from the dashboard summary. Refreshes
        while this page is open.
      </div>

      {/* Primary: fleet health + storage */}
      <div className="grid gap-6 xl:grid-cols-3">
        <E3Card gradientEdge className="xl:col-span-2">
          <E3CardHeader
            title="Fleet health"
            description={
              data.screens
                ? `${data.online} of ${data.screens} screens online · ${onlinePct}% coverage`
                : "No screens paired yet"
            }
            action={
              <Link
                to="/screens"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                View screens
              </Link>
            }
          />
          <E3CardBody>
            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <FleetMetric
                    label="Online"
                    value={data.online}
                    icon={Wifi}
                    tone="success"
                  />
                  <FleetMetric
                    label="Offline"
                    value={data.offline}
                    icon={WifiOff}
                    tone="danger"
                  />
                  <FleetMetric
                    label="Syncing"
                    value={data.syncing}
                    icon={RefreshCw}
                    tone="info"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Total screens
                    </p>
                    <p className="font-display mt-1 text-4xl font-bold tabular-nums tracking-tight">
                      {data.screens}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Locations
                    </p>
                    <p className="font-display mt-1 text-4xl font-bold tabular-nums tracking-tight">
                      {data.locations}
                    </p>
                  </div>
                  {criticalAlerts > 0 ? (
                    <p className="pb-1 text-sm text-destructive">
                      {criticalAlerts} critical alert{criticalAlerts === 1 ? "" : "s"} need attention
                    </p>
                  ) : (
                    <p className="pb-1 text-sm text-muted-foreground">
                      {data.alerts.length === 0
                        ? "No operational alerts"
                        : `${data.alerts.length} alert${data.alerts.length === 1 ? "" : "s"}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[220px]">
                <ChartContainer config={fleetConfig} className="mx-auto aspect-square h-[200px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Pie
                      data={fleetChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={82}
                      strokeWidth={2}
                      paddingAngle={fleetSlices.length > 1 ? 2 : 0}
                    >
                      {fleetChartData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={
                            fleetSlices.length > 0
                              ? FLEET_COLORS[entry.key]
                              : "var(--muted)"
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {(
                    [
                      ["Online", data.online, FLEET_COLORS.online],
                      ["Offline", data.offline, FLEET_COLORS.offline],
                      ["Syncing", data.syncing, FLEET_COLORS.syncing],
                    ] as const
                  ).map(([label, value, color]) => (
                    <li key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="size-2 shrink-0 rounded-sm"
                        style={{ background: color }}
                        aria-hidden
                      />
                      <span>
                        {label}{" "}
                        <span className="font-medium tabular-nums text-foreground">{value}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </E3CardBody>
        </E3Card>

        <E3Card>
          <E3CardHeader
            title="Cloud storage"
            description="Cloudflare R2 media quota"
            action={
              <Link
                to="/media"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Media
              </Link>
            }
          />
          <E3CardBody className="flex h-[calc(100%-4.5rem)] flex-col justify-between gap-5">
            <div>
              <div className="flex items-start justify-between gap-3">
                <HardDrive
                  className={cn(
                    "size-5",
                    data.storageAlerts > 0 ? "text-warning" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                {data.storageAlerts > 0 ? (
                  <span className="rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                    Quota alert
                  </span>
                ) : null}
              </div>
              <p className="font-display mt-4 text-3xl font-bold tabular-nums tracking-tight">
                {data.cloudStorage ? formatCloudStorageUsage(data.cloudStorage) : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.cloudStorage
                  ? `${Math.round(storagePct)}% of ${formatStorageBytes(data.cloudStorage.totalBytes)} used`
                  : "Usage unavailable"}
              </p>
            </div>
            <E3Progress value={storagePct} tone={storageTone} label="R2 quota" />
            <div className="grid grid-cols-2 gap-3">
              <MiniStat
                label="Active campaigns"
                value={data.activeCampaigns}
                icon={Megaphone}
                tone="success"
              />
              <MiniStat
                label="Scheduled"
                value={data.scheduledCampaigns}
                icon={CalendarClock}
                tone="info"
              />
            </div>
          </E3CardBody>
        </E3Card>
      </div>

      {/* Secondary KPIs — tighter, not eight equals */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <E3StatCard
          label="Locations"
          value={data.locations}
          icon={MapPin}
          sublabel="Active network sites"
        />
        <E3StatCard
          label="Screens"
          value={data.screens}
          icon={Monitor}
          highlight
          sublabel={`${data.online} online · ${data.offline} offline`}
        />
        <E3StatCard
          label="Active campaigns"
          value={data.activeCampaigns}
          icon={Megaphone}
          tone="success"
          sublabel="Currently in window"
        />
        <E3StatCard
          label="Scheduled campaigns"
          value={data.scheduledCampaigns}
          icon={CalendarClock}
          tone="info"
          sublabel="Upcoming windows"
        />
      </div>

      {/* Location chart + alerts */}
      <div className="grid gap-6 xl:grid-cols-3">
        <E3Card className="xl:col-span-2">
          <E3CardHeader
            title="Location status"
            description="Screens online per location"
            action={
              <Link
                to="/locations"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
              </Link>
            }
          />
          <E3CardBody className="space-y-5">
            {locationBars.length === 0 ? (
              <E3EmptyState
                title="No locations"
                description="Add a location to start tracking screen coverage."
              />
            ) : (
              <>
                <ChartContainer
                  config={locationConfig}
                  className="aspect-auto h-[240px] w-full"
                >
                  <BarChart
                    data={locationBars.slice(0, 8)}
                    layout="vertical"
                    accessibilityLayer
                    margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      width={104}
                      tickFormatter={(v) => shortLabel(String(v), 13)}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="online"
                      stackId="fleet"
                      fill="var(--color-online)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="offline"
                      stackId="fleet"
                      fill="var(--color-offline)"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ChartContainer>

                <ul className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
                  {data.locationStatus.map((l) => {
                    const pct = l.total ? Math.round((l.online / l.total) * 100) : 0;
                    return (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">{l.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {l.online}/{l.total}
                          {l.total > 0 ? (
                            <span className="ml-1.5 text-foreground">{pct}%</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
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

      {/* Now playing + activity */}
      <div className="grid gap-6 xl:grid-cols-2">
        <E3Card>
          <E3CardHeader
            title="Currently playing"
            description="Live content on active screens"
            action={
              <Link
                to="/screens"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Screens
              </Link>
            }
          />
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
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 p-3 transition-colors hover:bg-accent/50 active:scale-[0.99]"
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
          <E3CardHeader
            title="Recent activity"
            description="Sync acks and heartbeats · last 24 hours"
          />
          <E3CardBody>
            {data.activity.length === 0 ? (
              <E3EmptyState
                title="No recent activity"
                description="Sync confirmations and status changes will appear here once players report in."
              />
            ) : (
              <ol className="space-y-3">
                {data.activity.map((a, i) => (
                  <li
                    key={a.id}
                    className="flex gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5"
                  >
                    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
                      <Activity
                        className={cn(
                          "size-3.5",
                          i === 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.detail} · {a.at}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </E3CardBody>
        </E3Card>
      </div>
    </div>
  );
}

function FleetMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Wifi;
  tone: "success" | "danger" | "info";
}) {
  const toneText = {
    success: "text-success",
    danger: "text-destructive",
    info: "text-info",
  }[tone];

  return (
    <div className="rounded-xl border border-border/70 bg-background/40 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className={cn("size-3.5", toneText)} aria-hidden />
      </div>
      <p className={cn("font-display mt-1.5 text-2xl font-bold tabular-nums", toneText)}>{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Megaphone;
  tone: "success" | "info";
}) {
  const toneText = tone === "success" ? "text-success" : "text-info";
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={cn("size-3", toneText)} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("font-display mt-1 text-xl font-bold tabular-nums", toneText)}>{value}</p>
    </div>
  );
}
