import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";

import {
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3PageHeader,
  E3QueryBoundary,
  E3StatusBadge,
} from "@/components/e3";
import { cn } from "@/lib/utils";
import { effectiveCampaignStatus, formatCampaignDateTime, isDatedSchedule } from "@/lib/campaign-window";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasQueryClientContext } from "@/lib/router-preload";
import { useViewPreference } from "@/lib/view-preference";
import { scheduleService } from "@/services";

const SCHEDULE_VIEWS = ["calendar", "list"] as const;

export const Route = createFileRoute("/_shell/schedule")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/schedule");
  },
  head: () => ({
    meta: [
      { title: "Schedule — E3 Digital Signage" },
      {
        name: "description",
        content: "Calendar view of every scheduled campaign window across E3 screens.",
      },
      { property: "og:title", content: "Schedule — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Calendar view of every scheduled campaign window across E3 screens.",
      },
    ],
  }),
  component: SchedulePage,
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthMeta(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const label = date.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const isoPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { daysInMonth, startWeekday, label, isoPrefix };
}

function SchedulePage() {
  const [view, setView] = useViewPreference("schedule", SCHEDULE_VIEWS, "calendar");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["schedule"],
    queryFn: scheduleService.list,
  });

  const campaigns = (data ?? []).filter((c) => isDatedSchedule(c.schedule));
  const month = monthMeta();

  function campaignsOnDay(day: number) {
    const date = `${month.isoPrefix}-${String(day).padStart(2, "0")}`;
    return campaigns.filter((c) => c.schedule.startDate <= date && c.schedule.endDate >= date);
  }

  return (
    <div>
      <E3PageHeader
        title="Schedule"
        description="Dated campaign windows only. Ongoing / always-on campaigns are listed on the Campaigns page."
        actions={
          <div className="flex overflow-hidden rounded-xl border border-border">
            {(["calendar", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn("px-4 py-2 text-sm capitalize", view === v && "bg-accent")}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {campaigns.length === 0 ? (
          <E3EmptyState
            icon={CalendarClock}
            title="Nothing scheduled"
            description="Publish a campaign with start and end dates to populate the calendar. Ongoing campaigns live under Campaigns → Ongoing."
            action={
              <Link to="/campaigns" className="text-sm font-medium text-foreground hover:underline">
                View ongoing campaigns
              </Link>
            }
          />
        ) : view === "calendar" ? (
          <E3Card>
            <E3CardHeader title={month.label} description="Campaign coverage by day" />
            <E3CardBody>
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
                {Array.from({ length: month.startWeekday }).map((_, i) => (
                  <div key={`pad-${i}`} className="min-h-20" />
                ))}
                {Array.from({ length: month.daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const items = campaignsOnDay(day);
                  return (
                    <div
                      key={day}
                      className="min-h-20 rounded-xl border border-border bg-background/40 p-1.5"
                    >
                      <p className="text-[11px] tabular-nums text-muted-foreground">{day}</p>
                      <div className="mt-1 space-y-1">
                        {items.slice(0, 2).map((c) => (
                          <Link
                            key={c.id}
                            to="/campaigns/$id"
                            params={{ id: c.id }}
                            className="e3-gradient block truncate rounded-md px-1.5 py-0.5 text-[10px] text-white"
                          >
                            {c.name}
                          </Link>
                        ))}
                        {items.length > 2 ? (
                          <p className="text-[10px] text-muted-foreground">+{items.length - 2}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </E3CardBody>
          </E3Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                to="/campaigns/$id"
                params={{ id: c.id }}
                className="grid gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.schedule.days.join(" ")} · {c.schedule.startTime}–{c.schedule.endTime} ·{" "}
                    {c.schedule.timezone} · Priority {c.schedule.priority}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {formatCampaignDateTime(c.schedule.startDate, c.schedule.startTime, c.schedule.timezone)} →{" "}
                    {formatCampaignDateTime(c.schedule.endDate, c.schedule.endTime, c.schedule.timezone)}
                  </span>
                  <E3StatusBadge status={effectiveCampaignStatus(c.status, c.schedule)} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </E3QueryBoundary>
    </div>
  );
}
