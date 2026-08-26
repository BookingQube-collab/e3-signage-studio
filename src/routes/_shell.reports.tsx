import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { reportService } from "@/services";
import { ADMIN_MONITORING_REFETCH_MS, toCsv } from "@/lib/monitoring";
import type { AvailabilityRow, CampaignPerformanceRow, ProofOfPlayRow } from "@/types";

export const Route = createFileRoute("/_shell/reports")({
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

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Proof of Play");

  const pop = useQuery({
    queryKey: ["report-pop"],
    queryFn: reportService.proofOfPlay,
    refetchInterval: ADMIN_MONITORING_REFETCH_MS,
  });
  const avail = useQuery({
    queryKey: ["report-avail"],
    queryFn: reportService.availability,
    refetchInterval: ADMIN_MONITORING_REFETCH_MS,
  });
  const perf = useQuery({
    queryKey: ["report-perf"],
    queryFn: reportService.campaignPerformance,
    refetchInterval: ADMIN_MONITORING_REFETCH_MS,
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

  const popColumns: E3Column<ProofOfPlayRow>[] = [
    { key: "date", header: "Date", cell: (r) => r.date },
    {
      key: "content",
      header: "Media",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.media}</p>
          <p className="truncate text-xs text-muted-foreground">{r.playlist}</p>
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", cell: (r) => r.campaign },
    { key: "screen", header: "Screen", cell: (r) => r.screen },
    { key: "location", header: "Location", cell: (r) => r.location },
    { key: "plays", header: "Plays", cell: (r) => r.playCount.toLocaleString() },
    { key: "duration", header: "Duration", cell: (r) => `${r.totalDurationMin} min` },
    { key: "success", header: "Success", cell: (r) => `${r.successRate}%` },
  ];

  const availColumns: E3Column<AvailabilityRow>[] = [
    { key: "screen", header: "Screen", cell: (r) => r.screen },
    { key: "location", header: "Location", cell: (r) => r.location },
    {
      key: "uptime",
      header: "Online",
      cell: (r) => <E3Progress className="w-36" value={r.onlinePct} label={`${r.onlinePct}%`} />,
    },
    { key: "offline", header: "Offline", cell: (r) => `${r.offlinePct}%` },
    { key: "seen", header: "Last seen", cell: (r) => r.lastSeen },
  ];

  const perfColumns: E3Column<CampaignPerformanceRow>[] = [
    { key: "campaign", header: "Campaign", cell: (r) => r.campaign },
    { key: "screens", header: "Screens", cell: (r) => r.screens },
    { key: "plays", header: "Plays", cell: (r) => r.plays.toLocaleString() },
    { key: "hours", header: "Hours played", cell: (r) => r.hoursPlayed },
    { key: "completion", header: "Completion", cell: (r) => `${r.completionRate}%` },
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
                  ["Date", "Media", "Playlist", "Campaign", "Screen", "Location", "Plays", "Duration min", "Success %"],
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <E3StatCard label="Total plays" value={totalPlays.toLocaleString()} />
            <E3StatCard label="Avg uptime" value={`${avgUptime}%`} tone="success" />
            <E3StatCard label="Hours played" value={hoursPlayed} />
            <E3StatCard label="Avg completion" value={`${avgCompletion}%`} />
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm",
                  tab === t
                    ? "e3-gradient border-transparent text-white"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <E3Card>
            <E3CardHeader
              title={tab}
              description="Last 30 days · proof of play from player log batches, availability from heartbeats"
            />
            <E3CardBody>
              {tab === "Proof of Play" ? (
                popRows.length === 0 ? (
                  <E3EmptyState
                    title="No proof of play yet"
                    description="Completed plays from the TV player will appear here after content is published and playing."
                  />
                ) : (
                  <E3Table
                    columns={popColumns}
                    rows={popRows}
                    rowKey={(r) => r.id}
                    caption="Proof of play"
                  />
                )
              ) : tab === "Screen Availability" ? (
                availRows.length === 0 ? (
                  <E3EmptyState
                    title="No screens"
                    description="Pair a screen to see heartbeat-based availability."
                  />
                ) : (
                  <E3Table
                    columns={availColumns}
                    rows={availRows}
                    rowKey={(r) => r.screenId}
                    caption="Screen availability"
                  />
                )
              ) : perfRows.length === 0 ? (
                <E3EmptyState
                  title="No campaign plays yet"
                  description="Campaign metrics come from proof-of-play batches once published content is on air."
                />
              ) : (
                <E3Table
                  columns={perfColumns}
                  rows={perfRows}
                  rowKey={(r) => r.campaign}
                  caption="Campaign performance"
                />
              )}
            </E3CardBody>
          </E3Card>
        </div>
      </E3QueryBoundary>
    </div>
  );
}
