import type { CampaignStatus, Schedule } from "@/types";

import { wallTimeToUtcMs } from "./zoned-time.ts";

export type CampaignWindow = Pick<Schedule, "startDate" | "endDate" | "startTime" | "endTime" | "timezone">;

function tzOf(window: CampaignWindow): string {
  return window.timezone || "Asia/Qatar";
}

function hasDate(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** No start and no end — always eligible until paused/archived. */
export function isEvergreenSchedule(
  window: Pick<CampaignWindow, "startDate" | "endDate"> | null | undefined,
): boolean {
  if (!window) return false;
  return !hasDate(window.startDate) && !hasDate(window.endDate);
}

/** Both bounds set — belongs on the calendar/scheduler. */
export function isDatedSchedule(
  window: Pick<CampaignWindow, "startDate" | "endDate"> | null | undefined,
): boolean {
  if (!window) return false;
  return hasDate(window.startDate) && hasDate(window.endDate);
}

export function campaignStartMs(window: CampaignWindow): number {
  return wallTimeToUtcMs(window.startDate, window.startTime || "00:00", tzOf(window));
}

export function campaignEndMs(window: CampaignWindow): number {
  return wallTimeToUtcMs(window.endDate, window.endTime || "23:59", tzOf(window));
}

/** Tie-break: dated windows beat evergreen (epoch) when priority is equal. */
export function campaignTieBreakStart(window: CampaignWindow | null | undefined): Date {
  if (!window || !hasDate(window.startDate)) return new Date(0);
  const ms = campaignStartMs(window);
  return Number.isFinite(ms) ? new Date(ms) : new Date(0);
}

/** Overall campaign window vs now — not the daily play hours repeating. */
export function campaignLifecycleStatus(
  window: CampaignWindow | null | undefined,
  nowMs = Date.now(),
): "Scheduled" | "Active" | "Ended" {
  if (!window) return "Scheduled";
  const boundedStart = hasDate(window.startDate);
  const boundedEnd = hasDate(window.endDate);
  if (!boundedStart && !boundedEnd) return "Active";

  if (boundedStart) {
    const start = campaignStartMs(window);
    if (!Number.isFinite(start)) return "Scheduled";
    if (nowMs < start) return "Scheduled";
  }
  if (boundedEnd) {
    const end = campaignEndMs(window);
    if (!Number.isFinite(end)) return "Active";
    if (nowMs > end) return "Ended";
  }
  return "Active";
}

const FROZEN_STATUSES = new Set<CampaignStatus>(["Draft", "Paused", "Archived", "Publishing"]);

/** Listing/detail badge: keep paused/draft/archived; otherwise derive from start/end datetime. */
export function effectiveCampaignStatus(
  stored: CampaignStatus,
  window: CampaignWindow | null | undefined,
  nowMs = Date.now(),
): CampaignStatus {
  if (stored && FROZEN_STATUSES.has(stored)) return stored;
  return campaignLifecycleStatus(window, nowMs);
}

export function formatCampaignDateTime(
  date: string | null | undefined,
  time: string | null | undefined,
  timeZone: string | null | undefined,
): string {
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

export function formatCampaignWindowLabel(window: CampaignWindow | null | undefined): string {
  if (!window) return "—";
  if (isEvergreenSchedule(window)) return "Ongoing";
  return `${formatCampaignDateTime(window.startDate, window.startTime, window.timezone)} → ${formatCampaignDateTime(window.endDate, window.endTime, window.timezone)}`;
}
