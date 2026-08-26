import { listScheduledCampaignsFn } from "@/lib/campaign-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import { toUiCampaign } from "./campaign-map";
import type { ScheduleService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

export const liveScheduleService: ScheduleService = {
  list: async () => {
    const rows = await listScheduledCampaignsFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiCampaign);
  },
};
