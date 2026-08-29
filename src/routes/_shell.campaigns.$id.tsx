import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  E3Button,
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3Modal,
  E3PageHeader,
  E3QueryBoundary,
  E3StatusBadge,
} from "@/components/e3";
import { SyncStatusPanel } from "@/features/campaigns/SyncStatusPanel";
import { effectiveCampaignStatus, formatCampaignWindowLabel, isEvergreenSchedule } from "@/lib/campaign-window";
import { campaignService } from "@/services";
import { NO_LOCATION_ACCESS_MESSAGE } from "@/lib/location-scope";
import { invalidateKeysInBackground, removeById, writeEntityCache } from "@/lib/query-cache";
import { hasPermission } from "@/lib/rbac";
import type { Campaign } from "@/types";

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
  const { auth } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canManage = Boolean(auth?.ok && hasPermission(auth.profile.role, "campaigns.manage"));
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      writeEntityCache(qc, {
        detailKey: ["campaign", id],
        listKey: ["campaigns"],
        entity: c,
      });
      toast.success(c.status === "Paused" ? "Campaign stopped" : "Campaign resumed");
      invalidateKeysInBackground(qc, [["campaign-sync", id], ["schedule"]]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not update campaign.");
    },
  });

  const remove = useMutation({
    mutationFn: () => campaignService.remove(id),
    onSuccess: () => {
      qc.setQueryData(["campaigns"], (prev: Campaign[] | undefined) =>
        removeById(Array.isArray(prev) ? prev : [], id),
      );
      qc.removeQueries({ queryKey: ["campaign", id] });
      toast.success("Campaign deleted. Screens stay paired.");
      setDeleteOpen(false);
      void navigate({ to: "/campaigns" });
      invalidateKeysInBackground(qc, [["schedule"], ["dashboard"]]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete campaign.");
    },
  });

  return (
    <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
      {!data ? (
        <E3EmptyState
          title={NO_LOCATION_ACCESS_MESSAGE}
          description="This campaign is not targeted at your assigned locations, or it may have been archived."
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
                <E3StatusBadge status={effectiveCampaignStatus(data.status, data.schedule)} className="self-center" />
                {isEvergreenSchedule(data.schedule) ? (
                  <E3StatusBadge status="Ongoing" className="self-center" />
                ) : null}
                <E3Button
                  variant="outline"
                  onClick={() => void navigate({ to: "/campaigns/new", search: { edit: data.id } })}
                >
                  <Pencil />
                  Edit
                </E3Button>
                {canManage ? (
                  <E3Button variant="danger" onClick={() => setDeleteOpen(true)}>
                    <Trash2 />
                    Delete
                  </E3Button>
                ) : null}
                {data.status === "Paused" || data.status === "Active" || data.status === "Scheduled" ? (
                  <E3Button variant="primary" loading={toggle.isPending} onClick={() => toggle.mutate()}>
                    {data.status === "Paused" ? <Play /> : <Pause />}
                    {data.status === "Paused" ? "Resume" : "Stop"}
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
                      ["Window", formatCampaignWindowLabel(data.schedule)],
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

          <E3Modal
            open={deleteOpen}
            onOpenChange={(open) => {
              if (!open && remove.isPending) return;
              setDeleteOpen(open);
            }}
            title={`Delete ${data.name}?`}
            description="This removes the campaign from the CMS. Screens stay paired. If this campaign was on a screen, it will be taken off."
            footer={
              <>
                <E3Button variant="outline" disabled={remove.isPending} onClick={() => setDeleteOpen(false)}>
                  Cancel
                </E3Button>
                <E3Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  Delete campaign
                </E3Button>
              </>
            }
          />
        </div>
      )}
    </E3QueryBoundary>
  );
}
