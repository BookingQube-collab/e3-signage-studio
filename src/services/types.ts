import type {
  ActivityItem,
  AlertItem,
  AvailabilityRow,
  Campaign,
  CampaignPerformanceRow,
  DeviceLogLine,
  Layout,
  Location,
  Media,
  MediaFolder,
  Playlist,
  ProofOfPlayRow,
  Screen,
  ScreenGroup,
  SyncStatusItem,
  User,
} from "@/types";

export type ScreenPairInput = {
  code: string;
  name: string;
  locationId: string;
  screenType: string;
  orientation: Screen["orientation"];
  resolution: string;
  groupIds: string[];
};

export type DashboardNowPlaying = {
  id: string;
  name: string;
  locationName: string;
  nowPlaying: string | null;
  status: Screen["status"];
};

export type DashboardSummary = {
  locations: number;
  screens: number;
  online: number;
  offline: number;
  syncing: number;
  activeCampaigns: number;
  scheduledCampaigns: number;
  storageAlerts: number;
  /** Measured Cloudflare R2 usage under the org prefix (null when unavailable). */
  cloudStorage: {
    usedBytes: number;
    totalBytes: number;
  } | null;
  locationStatus: Array<{
    id: string;
    name: string;
    total: number;
    online: number;
  }>;
  nowPlaying: DashboardNowPlaying[];
  activity: ActivityItem[];
  alerts: AlertItem[];
};

export type LocationService = {
  list: () => Promise<Location[]>;
  get: (id: string) => Promise<Location | null>;
  create: (input: Omit<Location, "id" | "createdAt">) => Promise<Location>;
  update: (id: string, input: Omit<Location, "id" | "createdAt">) => Promise<Location>;
  updateWaitingScreen: (
    id: string,
    input: { mediaId: string | null; title: string | null; message: string | null },
  ) => Promise<Location>;
  remove: (id: string) => Promise<boolean>;
};

export type ScreenService = {
  list: () => Promise<Screen[]>;
  get: (id: string) => Promise<Screen | null>;
  listByLocation: (locationId: string) => Promise<Screen[]>;
  pair: (input: ScreenPairInput) => Promise<Screen>;
  repair: (id: string, code: string) => Promise<Screen>;
  update: (id: string, patch: Partial<Screen>) => Promise<Screen>;
  duplicate: (id: string) => Promise<Screen>;
  syncNow: (id: string) => Promise<Screen>;
  unpair: (id: string) => Promise<boolean>;
  logs: (id: string) => Promise<DeviceLogLine[]>;
};

export type ScreenGroupService = {
  list: () => Promise<ScreenGroup[]>;
  create: (input: Omit<ScreenGroup, "id">) => Promise<ScreenGroup>;
  update: (id: string, patch: Partial<ScreenGroup>) => Promise<ScreenGroup>;
  remove: (id: string) => Promise<boolean>;
};

export type MediaUploadProgress = (fileName: string, percent: number, ready?: Media) => void;

export type MediaUploadResult = {
  uploaded: Media[];
  failed: Array<{ name: string; message: string }>;
};

export type MediaService = {
  list: () => Promise<Media[]>;
  get: (id: string) => Promise<Media | null>;
  upload: (
    files: File[],
    onProgress?: MediaUploadProgress,
    folderId?: string | null,
  ) => Promise<MediaUploadResult>;
  replace: (id: string, file: File, onProgress?: (percent: number) => void) => Promise<Media>;
  rename: (id: string, filename: string) => Promise<Media>;
  archive: (id: string) => Promise<Media>;
  remove: (id: string, options?: { deleteFromStorage?: boolean }) => Promise<boolean>;
  removeMany: (ids: string[], options?: { deleteFromStorage?: boolean }) => Promise<boolean>;
  downloadUrl: (id: string) => Promise<{ url: string; filename: string }>;
  resyncFromStorage: (folderId?: string | null) => Promise<Media[]>;
  listFolders: () => Promise<MediaFolder[]>;
  createFolder: (name: string) => Promise<MediaFolder>;
  deleteFolder: (id: string, options?: { deleteFromStorage?: boolean }) => Promise<boolean>;
  storageBackend: () => Promise<"r2" | "supabase">;
  moveToFolder: (id: string, folderId: string | null) => Promise<Media>;
  moveManyToFolder: (ids: string[], folderId: string | null) => Promise<Media[]>;
};

export type PlaylistService = {
  list: () => Promise<Playlist[]>;
  get: (id: string) => Promise<Playlist | null>;
  save: (playlist: Playlist) => Promise<Playlist>;
  remove: (id: string) => Promise<boolean>;
};

export type LayoutService = {
  list: () => Promise<Layout[]>;
  get: (id: string) => Promise<Layout | null>;
  save: (layout: Layout) => Promise<Layout>;
  remove: (id: string) => Promise<boolean>;
};

export type CampaignService = {
  list: () => Promise<Campaign[]>;
  get: (id: string) => Promise<Campaign | null>;
  save: (campaign: Campaign) => Promise<Campaign>;
  publish: (campaign: Campaign) => Promise<Campaign>;
  remove: (id: string) => Promise<void>;
  syncStatus: (campaignId: string) => Promise<SyncStatusItem[]>;
};

export type ScheduleService = {
  list: () => Promise<Campaign[]>;
};

export type UserService = {
  list: () => Promise<User[]>;
  save: (user: User) => Promise<User>;
  remove: (id: string) => Promise<boolean>;
  invite: (input: {
    name: string;
    email: string;
    role: User["role"];
    locationIds: string[];
  }) => Promise<User>;
  create: (input: {
    name: string;
    username: string;
    password: string;
    email?: string;
    role: User["role"];
    locationIds: string[];
  }) => Promise<User>;
};

export type DashboardService = {
  summary: () => Promise<DashboardSummary>;
};

export type ReportService = {
  proofOfPlay: () => Promise<ProofOfPlayRow[]>;
  availability: () => Promise<AvailabilityRow[]>;
  campaignPerformance: () => Promise<CampaignPerformanceRow[]>;
};

export type AppServices = {
  locationService: LocationService;
  screenService: ScreenService;
  screenGroupService: ScreenGroupService;
  mediaService: MediaService;
  playlistService: PlaylistService;
  layoutService: LayoutService;
  campaignService: CampaignService;
  scheduleService: ScheduleService;
  userService: UserService;
  dashboardService: DashboardService;
  reportService: ReportService;
};
