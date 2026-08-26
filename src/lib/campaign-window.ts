import type { CampaignStatus, Schedule } from "@/types";

import { wallTimeToUtcMs } from "./zoned-time.ts";

export type CampaignWindow = Pick<Schedule, "startDate" | "endDate" | "startTime" | "endTime" | "timezone">;

function tzOf(window: CampaignWindow): string {
  return window.timezone || "Asia/Qatar";
}

export function campaignStartMs(window: CampaignWindow): number {
  return wallTimeToUtcMs(window.startDate, window.startTime || "00:00", tzOf(window));
}

export function campaignEndMs(window: CampaignWindow): number {
  return wallTimeToUtcMs(window.endDate, window.endTime || "23:59", tzOf(window));
}

/** Overall campaign window vs now — not the daily play hours repeating. */
export function campaignLifecycleStatus(
  window: CampaignWindow,
  nowMs = Date.now(),
): "Scheduled" | "Active" | "Ended" {
  if (!window.startDate || !window.endDate) return "Scheduled";
  const start = campaignStartMs(window);
  const end = campaignEndMs(window);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Scheduled";
  if (nowMs < start) return "Scheduled";
  if (nowMs > end) return "Ended";
  return "Active";
}

const FROZEN_STATUSES = new Set<CampaignStatus>(["Draft", "Paused", "Archived", "Publishing"]);

/** Listing/detail badge: keep paused/draft/archived; otherwise derive from start/end datetime. */
export function effectiveCampaignStatus(
  stored: CampaignStatus,
  window: CampaignWindow,
  nowMs = Date.now(),
): CampaignStatus {
  if (FROZEN_STATUSES.has(stored)) return stored;
  return campaignLifecycleStatus(window, nowMs);
}

export function formatCampaignDateTime(date: string, time: string, timeZone: string): string {
  if (!date) return "—";
  const tz = timeZone || "Asia/Qatar";
  const hhmm = (time || "00:00").slice(0, 5);
  try {
    const ms = wallTimeToUtcMs(date, hhmm, tz);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ms));
  } catch {
    return `${date} ${hhmm}`;
  }
}
