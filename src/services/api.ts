import type { AppServices } from "./types";

export class ApiNotConfiguredError extends Error {
  constructor() {
    super(
      "VITE_API_MODE=api is set, but the live backend is not wired yet. Leave VITE_API_MODE=mock until Supabase keys are configured (Phase 3).",
    );
    this.name = "ApiNotConfiguredError";
  }
}

function notConfigured(): never {
  throw new ApiNotConfiguredError();
}

/** HTTP adapter. Methods are typed to the same UI contracts as the mock. */
export const apiServices: AppServices = {
  locationService: {
    list: () => notConfigured(),
    get: () => notConfigured(),
    create: () => notConfigured(),
  },
  screenService: {
    list: () => notConfigured(),
    get: () => notConfigured(),
    listByLocation: () => notConfigured(),
    pair: () => notConfigured(),
    update: () => notConfigured(),
    syncNow: () => notConfigured(),
    unpair: () => notConfigured(),
  },
  screenGroupService: {
    list: () => notConfigured(),
    create: () => notConfigured(),
    update: () => notConfigured(),
    remove: () => notConfigured(),
  },
  mediaService: {
    list: () => notConfigured(),
    get: () => notConfigured(),
    upload: () => notConfigured(),
    rename: () => notConfigured(),
    remove: () => notConfigured(),
  },
  playlistService: {
    list: () => notConfigured(),
    get: () => notConfigured(),
    save: () => notConfigured(),
  },
  layoutService: {
    list: () => notConfigured(),
    get: () => notConfigured(),
    save: () => notConfigured(),
  },
  campaignService: {
    list: () => notConfigured(),
    get: () => notConfigured(),
    save: () => notConfigured(),
    syncStatus: () => notConfigured(),
  },
  scheduleService: {
    list: () => notConfigured(),
  },
  userService: {
    list: () => notConfigured(),
    save: () => notConfigured(),
    remove: () => notConfigured(),
  },
  dashboardService: {
    summary: () => notConfigured(),
  },
  reportService: {
    proofOfPlay: () => notConfigured(),
    availability: () => notConfigured(),
    campaignPerformance: () => notConfigured(),
  },
};
