import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CAMPAIGN_STATUSES } from "@e3/shared-types";

import type { CampaignRecord } from "@/services/campaign-map";
import type { SyncStatusItem } from "@/types";

const accessTokenSchema = z.object({ accessToken: z.string() });

function campaignStatusEnum() {
  return z.enum(CAMPAIGN_STATUSES);
}

const scheduleInputSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  days: z.array(z.string()),
  timezone: z.string().min(1),
  priority: z.number(),
});

const campaignWriteSchema = accessTokenSchema.extend({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  status: campaignStatusEnum(),
  contentType: z.enum(["Playlist", "Layout"]),
  contentId: z.string(),
  screenIds: z.array(z.string()),
  schedule: scheduleInputSchema,
});

export const listCampaignsFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<CampaignRecord[]> => {
    const { listCampaigns } = await import("@/server/campaigns.server");
    return listCampaigns(data.accessToken);
  });

export const getCampaignFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<CampaignRecord | null> => {
    const { getCampaign } = await import("@/server/campaigns.server");
    return getCampaign(data.accessToken, data.id);
  });

export const saveCampaignFn = createServerFn({ method: "POST" })
  .validator(campaignWriteSchema)
  .handler(async ({ data }): Promise<CampaignRecord> => {
    const { saveCampaign } = await import("@/server/campaigns.server");
    const { accessToken, ...input } = data;
    return saveCampaign(accessToken, input);
  });

export const publishCampaignFn = createServerFn({ method: "POST" })
  .validator(campaignWriteSchema)
  .handler(async ({ data }): Promise<CampaignRecord> => {
    const { publishCampaign } = await import("@/server/campaigns.server");
    const { accessToken, ...input } = data;
    return publishCampaign(accessToken, input);
  });

export const campaignSyncStatusFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ campaignId: z.string().min(1) }))
  .handler(async ({ data }): Promise<SyncStatusItem[]> => {
    const { campaignSyncStatus } = await import("@/server/campaigns.server");
    return campaignSyncStatus(data.accessToken, data.campaignId);
  });

export const listScheduledCampaignsFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<CampaignRecord[]> => {
    const { listScheduledCampaigns } = await import("@/server/campaigns.server");
    return listScheduledCampaigns(data.accessToken);
  });
