import { dashboardSummaryFn } from "@/lib/monitoring-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { DashboardService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

/**
 * Single slim server round-trip — not the full locations/screens/campaigns lists.
 */
export const liveDashboardService: DashboardService = {
  summary: async () => dashboardSummaryFn({ data: { accessToken: await accessToken() } }),
};
