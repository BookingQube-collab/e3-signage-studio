import { apiServices } from "./api";
import { mockServices } from "./mock";
import type { AppServices } from "./types";

/**
 * Service layer. Pages import these names — never mocks or HTTP clients directly.
 *
 * VITE_API_MODE=mock (default) — in-memory store, current Lovable behaviour.
 * VITE_API_MODE=api — live backend (throws until Phase 3 wires Supabase).
 */

function resolveServices(): AppServices {
  return import.meta.env.VITE_API_MODE === "api" ? apiServices : mockServices;
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
