import { invert, UI_LABELS } from "@e3/shared-types";
import type { CampaignStatus } from "@e3/shared-types";

import type { Campaign } from "@/types";

export const CAMPAIGN_STATUS_FROM_UI = invert(UI_LABELS.campaignStatus);

export type CampaignRecord = {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  contentType: "Playlist" | "Layout";
  contentId: string;
  contentName: string;
  locationIds: string[];
  screenIds: string[];
  schedule: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    days: string[];
    timezone: string;
    priority: number;
  };
  syncReady: number;
  syncTotal: number;
  modifiedAt: string;
};

export function toUiCampaign(row: CampaignRecord): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: UI_LABELS.campaignStatus[row.status],
    contentType: row.contentType,
    contentId: row.contentId,
    contentName: row.contentName,
    locationIds: row.locationIds,
    screenIds: row.screenIds,
    schedule: row.schedule,
    syncReady: row.syncReady,
    syncTotal: row.syncTotal,
    modifiedAt: row.modifiedAt,
  };
}
