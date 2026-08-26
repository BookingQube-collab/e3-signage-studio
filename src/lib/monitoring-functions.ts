import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ActivityItem,
  AvailabilityRow,
  CampaignPerformanceRow,
  DeviceLogLine,
  ProofOfPlayRow,
} from "@/types";

const accessTokenSchema = z.object({ accessToken: z.string() });

export const dashboardActivityFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<ActivityItem[]> => {
    const { listDashboardActivity } = await import("@/server/monitoring.server");
    return listDashboardActivity(data.accessToken);
  });

export const proofOfPlayFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<ProofOfPlayRow[]> => {
    const { listProofOfPlay } = await import("@/server/monitoring.server");
    return listProofOfPlay(data.accessToken);
  });

export const availabilityFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<AvailabilityRow[]> => {
    const { listAvailability } = await import("@/server/monitoring.server");
    return listAvailability(data.accessToken);
  });

export const campaignPerformanceFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<CampaignPerformanceRow[]> => {
    const { listCampaignPerformance } = await import("@/server/monitoring.server");
    return listCampaignPerformance(data.accessToken);
  });

export const deviceLogsFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ screenId: z.string().uuid() }))
  .handler(async ({ data }): Promise<DeviceLogLine[]> => {
    const { listDeviceLogs } = await import("@/server/monitoring.server");
    return listDeviceLogs(data.accessToken, data.screenId);
  });
