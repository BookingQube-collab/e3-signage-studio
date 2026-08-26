import { dashboardActivityFn } from "@/lib/monitoring-functions";
import { activityFromMonitoring, deriveAlerts, storageAlertCount } from "@/lib/monitoring";
import { getBrowserAccessToken } from "@/lib/supabase";
import { liveCampaignService } from "./campaigns";
import { liveLocationService } from "./locations";
import { liveScreenService } from "./screens";
import type { DashboardService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

/**
 * Dashboard fleet stats, alerts, and activity come from live screens,
 * heartbeats, and sync acks — not mock seed data.
 */
export const liveDashboardService: DashboardService = {
  summary: async () => {
    const token = await accessToken();
    const [locations, screens, campaigns, activity] = await Promise.all([
      liveLocationService.list(),
      liveScreenService.list(),
      liveCampaignService.list(),
      dashboardActivityFn({ data: { accessToken: token } }),
    ]);
    const visible = locations.filter((l) => l.status !== "Archived");
    const alerts = deriveAlerts(screens);
    const fromScreens = activityFromMonitoring([], screens);
    const seen = new Set(activity.map((item) => item.message));
    const mergedActivity = [...activity, ...fromScreens.filter((item) => !seen.has(item.message))].slice(
      0,
      8,
    );
    return {
      locations: visible.length,
      screens: screens.length,
      online: screens.filter((s) => s.status === "online").length,
      offline: screens.filter((s) => s.status === "offline").length,
      syncing: screens.filter((s) => s.status === "syncing").length,
      activeCampaigns: campaigns.filter((c) => c.status === "Active").length,
      scheduledCampaigns: campaigns.filter((c) => c.status === "Scheduled").length,
      storageAlerts: storageAlertCount(screens),
      locationStatus: visible.map((l) => ({
        id: l.id,
        name: l.shortName,
        total: screens.filter((s) => s.locationId === l.id).length,
        online: screens.filter((s) => s.locationId === l.id && s.status === "online").length,
      })),
      nowPlaying: screens.filter((s) => s.nowPlaying).slice(0, 5),
      activity: mergedActivity,
      alerts,
    };
  },
};
