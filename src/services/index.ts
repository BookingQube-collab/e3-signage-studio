/**
 * Live service layer. Pages import these names — never mocks or HTTP clients
 * directly. Re-exports stay tree-shakeable so a dashboard import does not pull
 * mock data, reports, or the campaign wizard client.
 */

export { liveLocationService as locationService } from "./locations";
export { liveScreenService as screenService } from "./screens";
export { liveScreenGroupService as screenGroupService } from "./screen-groups";
export { liveMediaService as mediaService } from "./media";
export { livePlaylistService as playlistService } from "./playlists";
export { liveLayoutService as layoutService } from "./layouts";
export { liveCampaignService as campaignService } from "./campaigns";
export { liveScheduleService as scheduleService } from "./schedules";
export { liveUserService as userService } from "./users";
export { liveDashboardService as dashboardService } from "./dashboard";
export { liveReportService as reportService } from "./reports";

export type { AppServices } from "./types";
