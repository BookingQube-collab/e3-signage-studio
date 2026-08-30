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
  /** Online screens whose active content manifest belongs to this campaign. */
  liveScreenCount: number;
  /** Most common media title among live screens, when known. */
  currentlyPlayingName: string | null;
  modifiedAt: string;
};

const FALLBACK_SCHEDULE: Campaign["schedule"] = {
  startDate: "",
  endDate: "",
  startTime: "00:00",
  endTime: "23:59",
  days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  timezone: "Asia/Qatar",
  priority: 6,
};

function toUiSchedule(schedule: CampaignRecord["schedule"] | undefined): Campaign["schedule"] {
  return {
    startDate: typeof schedule?.startDate === "string" ? schedule.startDate : "",
    endDate: typeof schedule?.endDate === "string" ? schedule.endDate : "",
    startTime: typeof schedule?.startTime === "string" ? schedule.startTime : FALLBACK_SCHEDULE.startTime,
    endTime: typeof schedule?.endTime === "string" ? schedule.endTime : FALLBACK_SCHEDULE.endTime,
    days: Array.isArray(schedule?.days) ? schedule.days : [...FALLBACK_SCHEDULE.days],
    timezone: schedule?.timezone || FALLBACK_SCHEDULE.timezone,
    priority: typeof schedule?.priority === "number" ? schedule.priority : FALLBACK_SCHEDULE.priority,
  };
}

export function toUiCampaign(row: CampaignRecord): Campaign {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: UI_LABELS.campaignStatus[row.status] ?? "Draft",
    contentType: row.contentType === "Layout" ? "Layout" : "Playlist",
    contentId: row.contentId,
    contentName: row.contentName,
    locationIds: Array.isArray(row.locationIds) ? row.locationIds : [],
    screenIds: Array.isArray(row.screenIds) ? row.screenIds : [],
    schedule: toUiSchedule(row.schedule),
    syncReady: row.syncReady ?? 0,
    syncTotal: row.syncTotal ?? 0,
    liveScreenCount: row.liveScreenCount ?? 0,
    currentlyPlayingName: row.currentlyPlayingName ?? null,
    modifiedAt: row.modifiedAt,
  };
}
