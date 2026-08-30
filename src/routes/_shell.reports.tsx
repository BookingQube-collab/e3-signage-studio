import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
  Clock3,
  Download,
  Film,
  MapPin,
  Monitor,
  Percent,
  Play,
} from "lucide-react";
import { useState } from "react";
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
  E3StatCard,
  E3Table,
  type E3Column,
} from "@/components/e3";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  campaignChartRows,
  campaignCompletionRows,
  lowestUptimeScreens,
  playsByCampaign,
  playsByDay,
  playsByLocation,
  playsByMediaType,
  playsByScreen,
  playsByWeekday,
  topContent,
  uniqueMediaPlayed,
  uniqueScreensPlayed,
  uptimeByLocation,
} from "@/lib/report-breakdowns";
import { reportService } from "@/services";
import { toCsv } from "@/lib/monitoring";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasQueryClientContext } from "@/lib/router-preload";
import type { AvailabilityRow, CampaignPerformanceRow, ProofOfPlayRow } from "@/types";

export const Route = createFileRoute("/_shell/reports")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/reports");
  },
  head: () => ({
    meta: [
      { title: "Reports — E3 Digital Signage" },
      {
        name: "description",
        content: "Proof of play, screen availability and campaign performance across the network.",
      },
      { property: "og:title", content: "Reports — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Proof of play, screen availability and campaign performance across the network.",
      },
    ],
  }),
  component: ReportsPage,
});

const TABS = ["Proof of Play", "Screen Availability", "Campaign Performance"] as const;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const playsConfig = {
  value: { label: "Plays", color: "var(--chart-2)" },
} satisfies ChartConfig;

const uptimeConfig = {
  value: { label: "Uptime %", color: "var(--chart-3)" },
} satisfies ChartConfig;

const typeConfig = {
  value: { label: "Plays", color: "var(--chart-1)" },
} satisfies ChartConfig;

const completionConfig = {
  value: { label: "Completion %", color: "var(--chart-1)" },
} satisfies ChartConfig;

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function shortLabel(value: string, max = 14): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function truncateChartData<T extends { name: string }>(rows: T[], limit = 8): T[] {
  return rows.slice(0, limit);
}

function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Proof of Play");

  const pop = useQuery({
    queryKey: ["report-pop"],
    queryFn: reportService.proofOfPlay,
  });
  const avail = useQuery({
    queryKey: ["report-avail"],
    queryFn: reportService.availability,
  });
  const perf = useQuery({
    queryKey: ["report-perf"],
    queryFn: reportService.campaignPerformance,
  });

  const popRows = pop.data ?? [];
  const availRows = avail.data ?? [];
  const perfRows = perf.data ?? [];

  const totalPlays = popRows.reduce((sum, r) => sum + r.playCount, 0);
  const avgUptime = availRows.length
    ? Math.round(availRows.reduce((s, r) => s + r.onlinePct, 0) / availRows.length)
    : 0;
  const hoursPlayed = Math.round(perfRows.reduce((s, r) => s + r.hoursPlayed, 0));
  const avgCompletion = perfRows.length
    ? Math.round(perfRows.reduce((s, r) => s + r.completionRate, 0) / perfRows.length)
    : 0;
  const screensWithPlays = uniqueScreensPlayed(popRows);
  const mediaAssets = uniqueMediaPlayed(popRows);
  const lowUptime = availRows.filter((r) => r.onlinePct < 50).length;

  const locationPlays = truncateChartData(playsByLocation(popRows));
  const mediaTypePlays = playsByMediaType(popRows);
  const weekdayPlays = playsByWeekday(popRows);
  const dailyPlays = playsByDay(popRows);
  const campaignPlays = truncateChartData(playsByCampaign(popRows));
  const topMedia = topContent(popRows, 6);
  const quietScreens = playsByScreen(popRows).slice(0, 5);
  const locationUptime = uptimeByLocation(availRows);
  const weakScreens = lowestUptimeScreens(availRows, 5);
  const campaignBars = truncateChartData(campaignChartRows(perfRows));
  const completionBars = truncateChartData(campaignCompletionRows(perfRows));

  const popColumns: E3Column<ProofOfPlayRow>[] = [
    {
      key: "date",
      header: "Date",
      className: "tabular-nums whitespace-nowrap",
      cell: (r) => r.date,
    },
    {
      key: "content",
      header: "Media",
      cell: (r) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate font-medium">{r.media}</p>
          <p className="truncate text-xs text-muted-foreground">{r.playlist}</p>
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", cell: (r) => r.campaign },
    { key: "screen", header: "Screen", cell: (r) => r.screen },
    { key: "location", header: "Location", cell: (r) => r.location },
    {
      key: "plays",
      header: "Plays",
      className: "tabular-nums text-right",
      cell: (r) => r.playCount.toLocaleString(),
    },
    {
      key: "duration",
      header: "Duration",
      className: "tabular-nums whitespace-nowrap",
      cell: (r) => `${r.totalDurationMin} min`,
    },
    {
      key: "success",
      header: "Success",
      className: "w-[140px]",
      cell: (r) => (
        <E3Progress
          className="w-28"
          value={r.successRate}
          label={`${r.successRate}%`}
          tone={r.successRate >= 90 ? "success" : r.successRate >= 50 ? "gradient" : "warning"}
        />
      ),
    },
  ];

  const availColumns: E3Column<AvailabilityRow>[] = [
    { key: "screen", header: "Screen", cell: (r) => r.screen },
    { key: "location", header: "Location", cell: (r) => r.location },
    {
      key: "uptime",
      header: "Online",
      cell: (r) => (
        <E3Progress
          className="w-36"
          value={r.onlinePct}
          label={`${r.onlinePct}%`}
          tone={r.onlinePct >= 90 ? "success" : r.onlinePct >= 50 ? "gradient" : "warning"}
        />
      ),
    },
    {
      key: "offline",
      header: "Offline",
      className: "tabular-nums",
      cell: (r) => `${r.offlinePct}%`,
    },
    { key: "seen", header: "Last seen", cell: (r) => r.lastSeen },
  ];

  const perfColumns: E3Column<CampaignPerformanceRow>[] = [
    { key: "campaign", header: "Campaign", cell: (r) => r.campaign },
    {
      key: "screens",
      header: "Screens",
      className: "tabular-nums",
      cell: (r) => r.screens,
    },
    {
      key: "plays",
      header: "Plays",
      className: "tabular-nums",
      cell: (r) => r.plays.toLocaleString(),
    },
    {
      key: "hours",
      header: "Hours played",
      className: "tabular-nums",
      cell: (r) => r.hoursPlayed,
    },
    {
      key: "completion",
      header: "Completion",
      cell: (r) => (
        <E3Progress
          className="w-32"
          value={r.completionRate}
          label={`${r.completionRate}%`}
          tone={r.completionRate >= 90 ? "success" : r.completionRate >= 50 ? "gradient" : "warning"}
        />
      ),
    },
  ];

  const isLoading = pop.isLoading || avail.isLoading || perf.isLoading;
  const isError = pop.isError || avail.isError || perf.isError;
  const refetch = () => {
    void pop.refetch();
    void avail.refetch();
    void perf.refetch();
  };

  return (
    <div>
      <E3PageHeader
        title="Reports"
        description="Operational reporting across content, devices and campaigns."
        actions={
          <E3Button
            variant="outline"
            onClick={() => {
              if (tab === "Proof of Play") {
                downloadCsv(
                  "e3-proof-of-play.csv",
                  [
                    "Date",
                    "Media",
                    "Playlist",
                    "Campaign",
                    "Screen",
                    "Location",
                    "Plays",
                    "Duration min",
                    "Success %",
                  ],
                  popRows.map((r) => [
                    r.date,
                    r.media,
                    r.playlist,
                    r.campaign,
                    r.screen,
                    r.location,
                    String(r.playCount),
                    String(r.totalDurationMin),
                    String(r.successRate),
                  ]),
                );
                toast.success("Proof of play CSV downloaded");
                return;
              }
              if (tab === "Screen Availability") {
                downloadCsv(
                  "e3-screen-availability.csv",
                  ["Screen", "Location", "Online %", "Offline %", "Last seen"],
                  availRows.map((r) => [
                    r.screen,
                    r.location,
                    String(r.onlinePct),
                    String(r.offlinePct),
                    r.lastSeen,
                  ]),
                );
                toast.success("Availability CSV downloaded");
                return;
              }
              downloadCsv(
                "e3-campaign-performance.csv",
                ["Campaign", "Screens", "Plays", "Hours played", "Completion %"],
                perfRows.map((r) => [
                  r.campaign,
                  String(r.screens),
                  String(r.plays),
                  String(r.hoursPlayed),
                  String(r.completionRate),
                ]),
              );
              toast.success("Campaign performance CSV downloaded");
            }}
          >
            <Download /> Export CSV
          </E3Button>
        }
      />

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={refetch}>
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/80 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Operational demographics</span>
            {" — "}
            breakdowns by location, media type, campaign, weekday and device uptime from player
            logs and heartbeats. Not audience age/gender from cameras.
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <E3StatCard
              label="Total plays"
              value={totalPlays.toLocaleString()}
              icon={Play}
              highlight
              sublabel="Last 30 days · proof of play"
            />
            <E3StatCard
              label="Avg uptime"
              value={`${avgUptime}%`}
              icon={Activity}
              tone={avgUptime >= 80 ? "success" : avgUptime >= 40 ? "warning" : "danger"}
              sublabel={
                lowUptime > 0 ? `${lowUptime} screen${lowUptime === 1 ? "" : "s"} under 50%` : "Heartbeat coverage"
              }
            />
            <E3StatCard
              label="Hours played"
              value={hoursPlayed.toLocaleString()}
              icon={Clock3}
              sublabel="Campaign play duration"
            />
            <E3StatCard
              label="Avg completion"
              value={`${avgCompletion}%`}
              icon={Percent}
              tone={avgCompletion >= 90 ? "success" : "neutral"}
              sublabel="Completed vs started plays"
            />
            <E3StatCard
              label="Screens with plays"
              value={screensWithPlays}
              icon={Monitor}
              sublabel={`${availRows.length} paired total`}
            />
            <E3StatCard
              label="Media assets"
              value={mediaAssets}
              icon={Film}
              sublabel="Distinct files played"
            />
          </div>

          <div
            role="tablist"
            aria-label="Report views"
            className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-1.5"
          >
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                  tab === t
                    ? "e3-gradient text-white shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "Proof of Play" ? (
            <ProofOfPlayPanels
              hasData={popRows.length > 0}
              locationPlays={locationPlays}
              mediaTypePlays={mediaTypePlays}
              weekdayPlays={weekdayPlays}
              dailyPlays={dailyPlays}
              campaignPlays={campaignPlays}
              topMedia={topMedia}
              quietScreens={quietScreens}
              columns={popColumns}
              rows={popRows}
            />
          ) : null}

          {tab === "Screen Availability" ? (
            <AvailabilityPanels
              hasData={availRows.length > 0}
              locationUptime={locationUptime}
              weakScreens={weakScreens}
              columns={availColumns}
              rows={availRows}
            />
          ) : null}

          {tab === "Campaign Performance" ? (
            <CampaignPanels
              hasData={perfRows.length > 0}
              campaignBars={campaignBars}
              completionBars={completionBars}
              columns={perfColumns}
              rows={perfRows}
            />
          ) : null}
        </div>
      </E3QueryBoundary>
    </div>
  );
}

function ProofOfPlayPanels({
  hasData,
  locationPlays,
  mediaTypePlays,
  weekdayPlays,
  dailyPlays,
  campaignPlays,
  topMedia,
  quietScreens,
  columns,
  rows,
}: {
  hasData: boolean;
  locationPlays: { name: string; value: number }[];
  mediaTypePlays: { name: string; value: number }[];
  weekdayPlays: { name: string; value: number }[];
  dailyPlays: { name: string; value: number }[];
  campaignPlays: { name: string; value: number }[];
  topMedia: ReturnType<typeof topContent>;
  quietScreens: ReturnType<typeof playsByScreen>;
  columns: E3Column<ProofOfPlayRow>[];
  rows: ProofOfPlayRow[];
}) {
  if (!hasData) {
    return (
      <E3Card>
        <E3CardBody>
          <E3EmptyState
            title="No proof of play yet"
            description="Completed plays from the TV player will appear here after content is published and playing."
          />
        </E3CardBody>
      </E3Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <E3Card gradientEdge>
          <E3CardHeader
            title="Plays by location"
            description="Where content is delivering across the network"
          />
          <E3CardBody>
            <ChartContainer config={playsConfig} className="aspect-auto h-[240px] w-full">
              <BarChart data={locationPlays} accessibilityLayer margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => shortLabel(String(v), 12)}
                  interval={0}
                />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </E3CardBody>
        </E3Card>

        <E3Card>
          <E3CardHeader
            title="Plays by media type"
            description="Inferred from file extension in proof-of-play logs"
          />
          <E3CardBody>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <ChartContainer config={typeConfig} className="mx-auto aspect-square h-[220px] w-full max-w-[240px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                  <Pie
                    data={mediaTypePlays}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    strokeWidth={2}
                    paddingAngle={2}
                  >
                    {mediaTypePlays.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <ul className="space-y-2 self-center">
                {mediaTypePlays.map((entry, i) => (
                  <li key={entry.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.name}</span>
                    <span className="tabular-nums font-medium">{entry.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </E3CardBody>
        </E3Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <E3Card>
          <E3CardHeader
            title="Plays by day of week"
            description="Calendar-day distribution from play dates (UTC)"
          />
          <E3CardBody>
            <ChartContainer config={playsConfig} className="aspect-auto h-[220px] w-full">
              <BarChart data={weekdayPlays} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </E3CardBody>
        </E3Card>

        <E3Card>
          <E3CardHeader
            title="Daily play volume"
            description="Trend across the last 30 days"
          />
          <E3CardBody>
            <ChartContainer config={playsConfig} className="aspect-auto h-[220px] w-full">
              <BarChart data={dailyPlays} accessibilityLayer margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => String(v).slice(5)}
                  minTickGap={28}
                />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </E3CardBody>
        </E3Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <E3Card>
          <E3CardHeader
            title="Plays by campaign"
            description="Campaign attribution from player batches"
          />
          <E3CardBody>
            {campaignPlays.length === 0 ? (
              <E3EmptyState title="No campaign plays" description="Plays without campaign tags will show as Unassigned." />
            ) : (
              <ChartContainer config={playsConfig} className="aspect-auto h-[220px] w-full">
                <BarChart
                  data={campaignPlays}
                  layout="vertical"
                  accessibilityLayer
                  margin={{ left: 8, right: 12 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={96}
                    tickFormatter={(v) => shortLabel(String(v), 12)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </E3CardBody>
        </E3Card>

        <E3Card>
          <E3CardHeader title="Top content" description="Highest play counts" />
          <E3CardBody className="space-y-3">
            {topMedia.map((item, i) => (
              <div
                key={`${item.media}-${item.campaign}`}
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.media}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.campaign}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{item.plays.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">{item.successRate}% ok</p>
                </div>
              </div>
            ))}
          </E3CardBody>
        </E3Card>

        <E3Card>
          <E3CardHeader
            title="Quietest screens"
            description="Lowest play volume in the window"
          />
          <E3CardBody className="space-y-3">
            {quietScreens.length === 0 ? (
              <E3EmptyState title="No screen plays" description="Screens appear once they report playback." />
            ) : (
              quietScreens.map((item) => (
                <div
                  key={`${item.location}-${item.screen}`}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5"
                >
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                    <Monitor className="size-3.5 text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.screen}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.location}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {item.plays.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </E3CardBody>
        </E3Card>
      </div>

      <E3Card>
        <E3CardHeader
          title="Proof of play detail"
          description="Last 30 days · player log batches"
        />
        <E3CardBody className="p-0 sm:p-0">
          <E3Table
            className="rounded-none border-0 border-t border-border"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            caption="Proof of play"
          />
        </E3CardBody>
      </E3Card>
    </div>
  );
}

function AvailabilityPanels({
  hasData,
  locationUptime,
  weakScreens,
  columns,
  rows,
}: {
  hasData: boolean;
  locationUptime: { name: string; value: number; screens?: number }[];
  weakScreens: AvailabilityRow[];
  columns: E3Column<AvailabilityRow>[];
  rows: AvailabilityRow[];
}) {
  if (!hasData) {
    return (
      <E3Card>
        <E3CardBody>
          <E3EmptyState
            title="No screens"
            description="Pair a screen to see heartbeat-based availability."
          />
        </E3CardBody>
      </E3Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-5">
        <E3Card className="xl:col-span-3" gradientEdge>
          <E3CardHeader
            title="Uptime by location"
            description="Average online % from heartbeat coverage"
          />
          <E3CardBody>
            <ChartContainer config={uptimeConfig} className="aspect-auto h-[260px] w-full">
              <BarChart data={locationUptime} accessibilityLayer margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => shortLabel(String(v), 12)}
                  interval={0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </E3CardBody>
        </E3Card>

        <E3Card className="xl:col-span-2">
          <E3CardHeader
            title="Needs attention"
            description="Lowest uptime screens"
          />
          <E3CardBody className="space-y-3">
            {weakScreens.map((screen) => (
              <div
                key={screen.screenId}
                className="rounded-xl border border-border/70 bg-background/40 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{screen.screen}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <MapPin className="mr-1 inline size-3" aria-hidden />
                      {screen.location}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      screen.onlinePct >= 80
                        ? "text-success"
                        : screen.onlinePct >= 40
                          ? "text-warning"
                          : "text-destructive",
                    )}
                  >
                    {screen.onlinePct}%
                  </span>
                </div>
                <E3Progress
                  className="mt-2"
                  value={screen.onlinePct}
                  tone={
                    screen.onlinePct >= 80 ? "success" : screen.onlinePct >= 40 ? "gradient" : "warning"
                  }
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">Last seen {screen.lastSeen}</p>
              </div>
            ))}
          </E3CardBody>
        </E3Card>
      </div>

      <E3Card>
        <E3CardHeader
          title="Screen availability detail"
          description="Last 30 days · heartbeats"
        />
        <E3CardBody className="p-0 sm:p-0">
          <E3Table
            className="rounded-none border-0 border-t border-border"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.screenId}
            caption="Screen availability"
          />
        </E3CardBody>
      </E3Card>
    </div>
  );
}

function CampaignPanels({
  hasData,
  campaignBars,
  completionBars,
  columns,
  rows,
}: {
  hasData: boolean;
  campaignBars: { name: string; value: number }[];
  completionBars: { name: string; value: number }[];
  columns: E3Column<CampaignPerformanceRow>[];
  rows: CampaignPerformanceRow[];
}) {
  if (!hasData) {
    return (
      <E3Card>
        <E3CardBody>
          <E3EmptyState
            title="No campaign plays yet"
            description="Campaign metrics come from proof-of-play batches once published content is on air."
          />
        </E3CardBody>
      </E3Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <E3Card gradientEdge>
          <E3CardHeader title="Plays by campaign" description="Volume from proof-of-play attribution" />
          <E3CardBody>
            <ChartContainer config={playsConfig} className="aspect-auto h-[260px] w-full">
              <BarChart
                data={campaignBars}
                layout="vertical"
                accessibilityLayer
                margin={{ left: 8, right: 12 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickFormatter={(v) => shortLabel(String(v), 14)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          </E3CardBody>
        </E3Card>

        <E3Card>
          <E3CardHeader
            title="Completion by campaign"
            description="Share of plays that finished successfully"
          />
          <E3CardBody>
            <ChartContainer config={completionConfig} className="aspect-auto h-[260px] w-full">
              <BarChart data={completionBars} accessibilityLayer margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => shortLabel(String(v), 10)}
                  interval={0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </E3CardBody>
        </E3Card>
      </div>

      <E3Card>
        <E3CardHeader
          title="Campaign performance detail"
          description="Last 30 days · aggregated from proof of play"
        />
        <E3CardBody className="p-0 sm:p-0">
          <E3Table
            className="rounded-none border-0 border-t border-border"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.campaign}
            caption="Campaign performance"
          />
        </E3CardBody>
      </E3Card>
    </div>
  );
}
