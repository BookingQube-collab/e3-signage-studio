import { useQuery } from "@tanstack/react-query";

import {
  E3Card,
  E3CardBody,
  E3CardHeader,
  E3EmptyState,
  E3Progress,
  E3QueryBoundary,
  E3StatusBadge,
} from "@/components/e3";
import { campaignService } from "@/services";
import { adminMonitoringRefetchInterval } from "@/lib/monitoring";
import { useLiveMonitoring } from "@/lib/use-live-monitoring";

export function SyncStatusPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaign-sync", campaignId],
    queryFn: () => campaignService.syncStatus(campaignId),
    refetchInterval: adminMonitoringRefetchInterval,
  });
  useLiveMonitoring([["campaign-sync", campaignId]]);

  const items = data ?? [];
  const ready = items.filter((i) => i.state === "Ready" || i.state === "Active").length;

  return (
    <E3Card>
      <E3CardHeader
        title={`${items.length} target screens`}
        description={`${ready} / ${items.length} ready`}
      />
      <E3CardBody className="space-y-3">
        <E3QueryBoundary
          isLoading={isLoading}
          isError={isError}
          refetch={() => void refetch()}
          skeleton={<p className="text-sm text-muted-foreground">Checking devices…</p>}
        >
          {items.length === 0 ? (
            <E3EmptyState
              title="No target screens"
              description="Select screens for this campaign to see sync progress."
            />
          ) : (
            <>
              <E3Progress
                value={items.length ? (ready / items.length) * 100 : 0}
                label={`${ready} / ${items.length} ready`}
              />
              <ul className="space-y-2 pt-2">
                {items.map((i) => (
                  <li
                    key={i.screenId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.screenName}</p>
                      <p className="truncate text-xs text-muted-foreground">{i.locationName}</p>
                    </div>
                    {i.state === "Downloading" ? (
                      <E3Progress className="w-32" value={i.progress} label="" />
                    ) : (
                      <E3StatusBadge status={i.state} />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </E3QueryBoundary>
      </E3CardBody>
    </E3Card>
  );
}
