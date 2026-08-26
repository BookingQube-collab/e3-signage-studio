import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3PageHeader,
  E3QueryBoundary,
  E3StatusBadge,
} from "@/components/e3";
import { SyncStatusPanel } from "@/features/campaigns/SyncStatusPanel";
import { campaignService } from "@/services";

export const Route = createFileRoute("/_shell/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign detail — E3 Digital Signage" },
      { name: "description", content: "Campaign targeting, schedule and per-screen sync status." },
      { property: "og:title", content: "Campaign detail — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Campaign targeting, schedule and per-screen sync status.",
      },
    ],
  }),
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => campaignService.get(id),
  });

  const toggle = useMutation({
    mutationFn: () => {
      if (!data) throw new Error("Campaign not found.");
      if (data.status === "Paused") {
        return campaignService.publish({ ...data, status: "Active" });
      }
      return campaignService.save({ ...data, status: "Paused" });
    },
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["campaign", id] });
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["campaign-sync", id] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      toast.success(c.status === "Paused" ? "Campaign paused" : "Campaign resumed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not update campaign.");
    },
  });

  return (
    <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
      {!data ? (
        <E3EmptyState
          title="Campaign not found"
          description="It may have been archived."
          action={
            <E3Button variant="outline" asChild>
              <Link to="/campaigns">Back to campaigns</Link>
            </E3Button>
          }
        />
      ) : (
        <div>
          <E3PageHeader
            breadcrumb={
              <Link to="/campaigns" className="hover:text-foreground">
                ← All campaigns
              </Link>
            }
            title={data.name}
            description={data.description}
            actions={
              <>
                <E3StatusBadge status={data.status} className="self-center" />
                {data.status === "Paused" || data.status === "Active" || data.status === "Scheduled" ? (
                  <E3Button variant="primary" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
                    {data.status === "Paused" ? <Play /> : <Pause />}
                    {data.status === "Paused" ? "Resume" : "Pause"}
                  </E3Button>
                ) : null}
              </>
            }
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <E3Card>
                <E3CardHeader title="Summary" />
                <E3CardBody>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["Content", data.contentName],
                      ["Content type", data.contentType],
                      ["Target screens", `${data.screenIds.length}`],
                      ["Locations", `${data.locationIds.length}`],
                      ["Window", `${data.schedule.startDate} → ${data.schedule.endDate}`],
                      ["Time", `${data.schedule.startTime}–${data.schedule.endTime}`],
                      ["Days", data.schedule.days.join(" ")],
                      ["Time zone", data.schedule.timezone],
                      ["Priority", `${data.schedule.priority}`],
                      ["Last modified", data.modifiedAt],
                    ].map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                        <dd className="mt-1 truncate text-sm font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </E3CardBody>
              </E3Card>
            </div>

            <SyncStatusPanel campaignId={data.id} />
          </div>
        </div>
      )}
    </E3QueryBoundary>
  );
}
