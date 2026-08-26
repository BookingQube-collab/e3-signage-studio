import { apiServices } from "./api";
import { liveCampaignService } from "./campaigns";
import { liveDashboardService } from "./dashboard";
import { liveLocationService } from "./locations";
import { liveLayoutService } from "./layouts";
import { liveMediaService } from "./media";
import { mockServices } from "./mock";
import { livePlaylistService } from "./playlists";
import { liveReportService } from "./reports";
import { liveScheduleService } from "./schedules";
import { liveScreenGroupService } from "./screen-groups";
import { liveScreenService } from "./screens";
import type { AppServices } from "./types";
import { liveUserService } from "./users";

/**
 * Service layer. Pages import these names — never mocks or HTTP clients directly.
 *
 * Locations, screens, screen groups, media, playlists, layouts, campaigns,
 * schedules, users, dashboard, and reports are live. Heartbeats and sync acks
 * drive ONLINE status, alerts, activity, and proof-of-play.
 * VITE_API_MODE=api — unused leftover adapter (all modules are live).
 */

function resolveServices(): AppServices {
  const base = import.meta.env.VITE_API_MODE === "api" ? apiServices : mockServices;
  return {
    ...base,
    locationService: liveLocationService,
    screenService: liveScreenService,
    screenGroupService: liveScreenGroupService,
    mediaService: liveMediaService,
    playlistService: livePlaylistService,
    layoutService: liveLayoutService,
    campaignService: liveCampaignService,
    scheduleService: liveScheduleService,
    userService: liveUserService,
    dashboardService: liveDashboardService,
    reportService: liveReportService,
  };
}

const services = resolveServices();

export const locationService = services.locationService;
export const screenService = services.screenService;
export const screenGroupService = services.screenGroupService;
export const mediaService = services.mediaService;
export const playlistService = services.playlistService;
export const layoutService = services.layoutService;
export const campaignService = services.campaignService;
export const scheduleService = services.scheduleService;
export const userService = services.userService;
export const dashboardService = services.dashboardService;
export const reportService = services.reportService;

export type { AppServices } from "./types";
