import {
  campaignSyncStatusFn,
  getCampaignFn,
  listCampaignsFn,
  publishCampaignFn,
  saveCampaignFn,
} from "@/lib/campaign-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { Campaign } from "@/types";
import { CAMPAIGN_STATUS_FROM_UI, toUiCampaign } from "./campaign-map";
import type { CampaignService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

function toWriteInput(campaign: Campaign) {
  const status = CAMPAIGN_STATUS_FROM_UI[campaign.status];
  if (!status) throw new Error("Invalid campaign status.");
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    status,
    contentType: campaign.contentType,
    contentId: campaign.contentId,
    screenIds: campaign.screenIds,
    schedule: campaign.schedule,
  };
}

export const liveCampaignService: CampaignService = {
  list: async () => {
    const rows = await listCampaignsFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiCampaign);
  },
  get: async (id) => {
    const row = await getCampaignFn({ data: { accessToken: await accessToken(), id } });
    return row ? toUiCampaign(row) : null;
  },
  save: async (campaign: Campaign) => {
    const row = await saveCampaignFn({
      data: { accessToken: await accessToken(), ...toWriteInput(campaign) },
    });
    return toUiCampaign(row);
  },
  publish: async (campaign: Campaign) => {
    const row = await publishCampaignFn({
      data: { accessToken: await accessToken(), ...toWriteInput(campaign) },
    });
    return toUiCampaign(row);
  },
  syncStatus: async (campaignId: string) => {
    return campaignSyncStatusFn({
      data: { accessToken: await accessToken(), campaignId },
    });
  },
};
