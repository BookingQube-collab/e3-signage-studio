import {
  availabilityFn,
  campaignPerformanceFn,
  proofOfPlayFn,
} from "@/lib/monitoring-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { ReportService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

export const liveReportService: ReportService = {
  proofOfPlay: async () => proofOfPlayFn({ data: { accessToken: await accessToken() } }),
  availability: async () => availabilityFn({ data: { accessToken: await accessToken() } }),
  campaignPerformance: async () =>
    campaignPerformanceFn({ data: { accessToken: await accessToken() } }),
};
