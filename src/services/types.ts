import type {
  ActivityItem,
  AlertItem,
  AvailabilityRow,
  Campaign,
  CampaignPerformanceRow,
  Layout,
  Location,
  Media,
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

export type DashboardSummary = {
  locations: number;
  screens: number;
  online: number;
  offline: number;
  syncing: number;
  activeCampaigns: number;
  scheduledCampaigns: number;
  storageAlerts: number;
  locationStatus: Array<{
    id: string;
    name: string;
    total: number;
    online: number;
  }>;
  nowPlaying: Screen[];
  activity: ActivityItem[];
  alerts: AlertItem[];
};

export type LocationService = {
  list: () => Promise<Location[]>;
  get: (id: string) => Promise<Location | null>;
  create: (input: Omit<Location, "id" | "createdAt">) => Promise<Location>;
};

export type ScreenService = {
  list: () => Promise<Screen[]>;
  get: (id: string) => Promise<Screen | null>;
  listByLocation: (locationId: string) => Promise<Screen[]>;
  pair: (input: ScreenPairInput) => Promise<Screen>;
  update: (id: string, patch: Partial<Screen>) => Promise<Screen>;
  syncNow: (id: string) => Promise<Screen>;
  unpair: (id: string) => Promise<boolean>;
};

export type ScreenGroupService = {
  list: () => Promise<ScreenGroup[]>;
  create: (input: Omit<ScreenGroup, "id">) => Promise<ScreenGroup>;
  update: (id: string, patch: Partial<ScreenGroup>) => Promise<ScreenGroup>;
  remove: (id: string) => Promise<boolean>;
};

export type MediaService = {
  list: () => Promise<Media[]>;
  get: (id: string) => Promise<Media | null>;
  upload: (files: Array<{ name: string; sizeMb: number; type: Media["type"] }>) => Promise<Media[]>;
  rename: (id: string, filename: string) => Promise<Media>;
  remove: (id: string) => Promise<boolean>;
};

export type PlaylistService = {
  list: () => Promise<Playlist[]>;
  get: (id: string) => Promise<Playlist | null>;
  save: (playlist: Playlist) => Promise<Playlist>;
};

export type LayoutService = {
  list: () => Promise<Layout[]>;
  get: (id: string) => Promise<Layout | null>;
  save: (layout: Layout) => Promise<Layout>;
};

export type CampaignService = {
  list: () => Promise<Campaign[]>;
  get: (id: string) => Promise<Campaign | null>;
  save: (campaign: Campaign) => Promise<Campaign>;
  syncStatus: (campaignId: string) => Promise<SyncStatusItem[]>;
};

export type ScheduleService = {
  list: () => Promise<Campaign[]>;
};

export type UserService = {
  list: () => Promise<User[]>;
  save: (user: User) => Promise<User>;
  remove: (id: string) => Promise<boolean>;
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
