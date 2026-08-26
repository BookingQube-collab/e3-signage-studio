import type { AppServices } from "./types";

export class ApiNotConfiguredError extends Error {
  constructor() {
    super(
      "VITE_API_MODE=api is set, but the live backend is not wired yet for this resource. Leave VITE_API_MODE=mock until Phase 4+ APIs are connected.",
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
    logs: () => notConfigured(),
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
    replace: () => notConfigured(),
    rename: () => notConfigured(),
    archive: () => notConfigured(),
    remove: () => notConfigured(),
    downloadUrl: () => notConfigured(),
    listFolders: () => notConfigured(),
    createFolder: () => notConfigured(),
    deleteFolder: () => notConfigured(),
    moveToFolder: () => notConfigured(),
    moveManyToFolder: () => notConfigured(),
    removeMany: () => notConfigured(),
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
    publish: () => notConfigured(),
    syncStatus: () => notConfigured(),
  },
  scheduleService: {
    list: () => notConfigured(),
  },
  userService: {
    list: () => notConfigured(),
    save: () => notConfigured(),
    remove: () => notConfigured(),
    invite: () => notConfigured(),
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
