import { liveCampaignService } from "./campaigns";
import { liveLocationService } from "./locations";
import { mockServices } from "./mock";
import { liveScreenService } from "./screens";
import type { DashboardService } from "./types";

/**
 * Dashboard stays mostly mock (activity, alerts, reports) until those phases.
 * Location, screen, and campaign counts come from live services.
 */
export const liveDashboardService: DashboardService = {
  summary: async () => {
    const [locations, screens, campaigns, mock] = await Promise.all([
      liveLocationService.list(),
      liveScreenService.list(),
      liveCampaignService.list(),
      mockServices.dashboardService.summary(),
    ]);
    const visible = locations.filter((l) => l.status !== "Archived");
    return {
      ...mock,
      locations: visible.length,
      screens: screens.length,
      online: screens.filter((s) => s.status === "online").length,
      offline: screens.filter((s) => s.status === "offline").length,
      syncing: screens.filter((s) => s.status === "syncing").length,
      activeCampaigns: campaigns.filter((c) => c.status === "Active").length,
      scheduledCampaigns: campaigns.filter((c) => c.status === "Scheduled").length,
      locationStatus: visible.map((l) => ({
        id: l.id,
        name: l.shortName,
        total: screens.filter((s) => s.locationId === l.id).length,
        online: screens.filter((s) => s.locationId === l.id && s.status === "online").length,
      })),
      nowPlaying: screens.filter((s) => s.nowPlaying).slice(0, 5),
    };
  },
};
