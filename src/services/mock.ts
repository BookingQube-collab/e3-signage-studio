import * as db from "@/mocks/data";
import { applyBulkFolderMove, assertBulkDeleteAllowed, partitionBulkDelete } from "@/lib/media-bulk";
import type {
  Campaign,
  DeviceLogLine,
  Layout,
  Location,
  Media,
  MediaFolder,
  Playlist,
  Screen,
  ScreenGroup,
  SyncStatusItem,
  User,
} from "@/types";
import type { AppServices } from "./types";

/**
 * In-memory mock backend. The Lovable UI keeps using these signatures until
 * VITE_API_MODE=api and Supabase are connected.
 */

const LATENCY = 320;

function delay<T>(value: T, ms = LATENCY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

const store = {
  locations: [...db.locations],
  screens: [...db.screens],
  screenGroups: [...db.screenGroups],
  media: [...db.media],
  folders: [] as MediaFolder[],
  playlists: [...db.playlists],
  layouts: [...db.layouts],
  campaigns: [...db.campaigns],
  users: [...db.users],
};

export const mockServices: AppServices = {
  locationService: {
    list: () => delay(store.locations),
    get: (id: string) => delay(store.locations.find((l) => l.id === id) ?? null),
    create: (input: Omit<Location, "id" | "createdAt">) => {
      const loc: Location = {
        ...input,
        id: `loc-${Date.now()}`,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      store.locations = [loc, ...store.locations];
      return delay(loc, 200);
    },
  },

  screenService: {
    list: () => delay(store.screens),
    get: (id: string) => delay(store.screens.find((s) => s.id === id) ?? null),
    listByLocation: (locationId: string) =>
      delay(store.screens.filter((s) => s.locationId === locationId)),
    pair: (input) => {
      const location = store.locations.find((l) => l.id === input.locationId);
      const screen: Screen = {
        id: `scr-${Date.now()}`,
        name: input.name,
        locationId: input.locationId,
        locationName: location?.name ?? "Unassigned",
        groupIds: input.groupIds,
        status: "online",
        screenType: input.screenType,
        orientation: input.orientation,
        resolution: input.resolution,
        playlistId: null,
        playlistName: null,
        nowPlaying: null,
        nowPlayingMediaId: null,
        syncState: "Waiting",
        syncProgress: 0,
        lastSeen: "just now",
        lastSync: "never",
        localVersion: "—",
        cloudVersion: "v43",
        storageUsedGb: 0,
        storageTotalGb: 64,
        appVersion: "E3 Player 1.4.2",
        lastError: null,
      };
      store.screens = [screen, ...store.screens];
      return delay(screen, 600);
    },
    repair: (id: string) => {
      const screen = store.screens.find((s) => s.id === id);
      if (!screen) return Promise.reject(new Error("Screen not found."));
      store.screens = store.screens.map((s) =>
        s.id === id
          ? { ...s, syncState: "Waiting", syncProgress: 0, lastSeen: "just now", lastError: null }
          : s,
      );
      return delay(store.screens.find((s) => s.id === id)!, 400);
    },
    update: (id: string, patch: Partial<Screen>) => {
      store.screens = store.screens.map((s) => (s.id === id ? { ...s, ...patch } : s));
      return delay(
        store.screens.find((s) => s.id === id)!,
        250,
      );
    },
    syncNow: (id: string) =>
      mockServices.screenService.update(id, {
        syncState: "Ready",
        syncProgress: 100,
        localVersion: "v43",
        lastSync: "just now",
      }),
    unpair: (id: string) => {
      store.screens = store.screens.filter((s) => s.id !== id);
      return delay(true, 250);
    },
    logs: () => delay<DeviceLogLine[]>([]),
  },

  screenGroupService: {
    list: () => delay(store.screenGroups),
    create: (input: Omit<ScreenGroup, "id">) => {
      const group: ScreenGroup = { ...input, id: `grp-${Date.now()}` };
      store.screenGroups = [group, ...store.screenGroups];
      return delay(group, 200);
    },
    update: (id: string, patch: Partial<ScreenGroup>) => {
      store.screenGroups = store.screenGroups.map((g) => (g.id === id ? { ...g, ...patch } : g));
      return delay(
        store.screenGroups.find((g) => g.id === id)!,
        200,
      );
    },
    remove: (id: string) => {
      store.screenGroups = store.screenGroups.filter((g) => g.id !== id);
      return delay(true, 200);
    },
  },

  mediaService: {
    list: () => delay(store.media),
    get: (id: string) => delay(store.media.find((m) => m.id === id) ?? null),
    upload: (files: File[], onProgress, folderId) => {
      const folder = folderId ? store.folders.find((f) => f.id === folderId) : null;
      const added: Media[] = files.map((file, i) => {
        onProgress?.(file.name, 100);
        const isVideo = file.type.startsWith("video") || /\.mp4$/i.test(file.name);
        return {
          id: `med-${Date.now()}-${i}`,
          filename: file.name,
          type: isVideo ? "Video" : "Image",
          dimensions: "1920 × 1080",
          durationSec: isVideo ? 30 : null,
          sizeMb: Number((file.size / 1_000_000).toFixed(1)) || 0.1,
          modifiedAt: new Date().toISOString().slice(0, 10),
          uploadedBy: "Rajan Pathak",
          uploadedAt: new Date().toISOString().slice(0, 10),
          version: "v1",
          thumbnailHue: Math.floor(Math.random() * 360),
          folderId: folder?.id ?? null,
          folderName: folder?.name ?? null,
          usedIn: { playlists: [], campaigns: [], screens: [] },
        };
      });
      store.media = [...added, ...store.media];
      if (folder) {
        store.folders = store.folders.map((f) =>
          f.id === folder.id ? { ...f, fileCount: f.fileCount + added.length } : f,
        );
      }
      return delay(added, 400);
    },
    replace: (id: string, file: File, onProgress) => {
      const existing = store.media.find((m) => m.id === id);
      if (!existing) return Promise.reject(new Error("Media not found."));
      onProgress?.(100);
      const isVideo = file.type.startsWith("video") || /\.mp4$/i.test(file.name);
      const next: Media = {
        ...existing,
        filename: file.name,
        type: isVideo ? "Video" : existing.type,
        sizeMb: Number((file.size / 1_000_000).toFixed(1)) || existing.sizeMb,
        modifiedAt: new Date().toISOString().slice(0, 10),
        version: `v${Number(existing.version.replace(/\D/g, "") || "1") + 1}`,
      };
      store.media = store.media.map((m) => (m.id === id ? next : m));
      return delay(next, 300);
    },
    rename: (id: string, filename: string) => {
      store.media = store.media.map((m) => (m.id === id ? { ...m, filename } : m));
      return delay(
        store.media.find((m) => m.id === id)!,
        200,
      );
    },
    archive: (id: string) => {
      const existing = store.media.find((m) => m.id === id);
      if (!existing) return Promise.reject(new Error("Media not found."));
      store.media = store.media.filter((m) => m.id !== id);
      return delay(existing, 200);
    },
    remove: (id: string) => {
      const existing = store.media.find((m) => m.id === id);
      if (!existing) return Promise.reject(new Error("Media not found."));
      if (existing.usedIn.playlists.length > 0) {
        return Promise.reject(new Error("This media is used in a playlist. Archive it instead of deleting."));
      }
      store.media = store.media.filter((m) => m.id !== id);
      return delay(true, 200);
    },
    removeMany: (ids: string[]) => {
      const { blocked, deletable } = partitionBulkDelete(store.media, ids);
      try {
        assertBulkDeleteAllowed(blocked);
      } catch (error) {
        return Promise.reject(error);
      }
      const deletableIds = new Set(deletable.map((item) => item.id));
      store.media = store.media.filter((m) => !deletableIds.has(m.id));
      store.folders = store.folders.map((f) => ({
        ...f,
        fileCount: store.media.filter((m) => m.folderId === f.id).length,
      }));
      return delay(true, 200);
    },
    downloadUrl: (id: string) => {
      const existing = store.media.find((m) => m.id === id);
      return delay({ url: "#", filename: existing?.filename ?? "media" }, 100);
    },
    listFolders: () => delay(store.folders),
    createFolder: (name: string) => {
      const folder = {
        id: `fld-${Date.now()}`,
        name: name.trim(),
        createdAt: new Date().toISOString().slice(0, 10),
        fileCount: 0,
      };
      store.folders = [...store.folders, folder].sort((a, b) => a.name.localeCompare(b.name));
      return delay(folder, 200);
    },
    deleteFolder: (id: string) => {
      if (store.media.some((m) => m.folderId === id)) {
        return Promise.reject(new Error("This folder still has files. Move them to another folder or Unfiled first."));
      }
      store.folders = store.folders.filter((f) => f.id !== id);
      return delay(true, 200);
    },
    moveToFolder: (id: string, folderId: string | null) => {
      const existing = store.media.find((m) => m.id === id);
      if (!existing) return Promise.reject(new Error("Media not found."));
      const folder = folderId ? store.folders.find((f) => f.id === folderId) : null;
      if (folderId && !folder) return Promise.reject(new Error("Folder not found."));
      const next = { ...existing, folderId, folderName: folder?.name ?? null };
      store.media = store.media.map((m) => (m.id === id ? next : m));
      store.folders = store.folders.map((f) => ({
        ...f,
        fileCount: store.media.filter((m) => m.folderId === f.id).length,
      }));
      return delay(next, 200);
    },
    moveManyToFolder: (ids: string[], folderId: string | null) => {
      const folder = folderId ? store.folders.find((f) => f.id === folderId) : null;
      if (folderId && !folder) return Promise.reject(new Error("Folder not found."));
      store.media = applyBulkFolderMove(store.media, ids, folderId, folder?.name ?? null);
      store.folders = store.folders.map((f) => ({
        ...f,
        fileCount: store.media.filter((m) => m.folderId === f.id).length,
      }));
      const moved = store.media.filter((m) => ids.includes(m.id));
      return delay(moved, 200);
    },
  },

  playlistService: {
    list: () => delay(store.playlists),
    get: (id: string) => delay(store.playlists.find((p) => p.id === id) ?? null),
    save: (playlist: Playlist) => {
      const exists = store.playlists.some((p) => p.id === playlist.id);
      store.playlists = exists
        ? store.playlists.map((p) => (p.id === playlist.id ? playlist : p))
        : [playlist, ...store.playlists];
      return delay(playlist, 350);
    },
  },

  layoutService: {
    list: () => delay(store.layouts),
    get: (id: string) => delay(store.layouts.find((l) => l.id === id) ?? null),
    save: (layout: Layout) => {
      const exists = store.layouts.some((l) => l.id === layout.id);
      store.layouts = exists
        ? store.layouts.map((l) => (l.id === layout.id ? layout : l))
        : [layout, ...store.layouts];
      return delay(layout, 350);
    },
  },

  campaignService: {
    list: () => delay(store.campaigns),
    get: (id: string) => delay(store.campaigns.find((c) => c.id === id) ?? null),
    save: (campaign: Campaign) => {
      const exists = store.campaigns.some((c) => c.id === campaign.id);
      store.campaigns = exists
        ? store.campaigns.map((c) => (c.id === campaign.id ? campaign : c))
        : [campaign, ...store.campaigns];
      return delay(campaign, 400);
    },
    publish: (campaign: Campaign) => {
      const published = { ...campaign, status: campaign.status === "Draft" ? "Active" : campaign.status };
      const exists = store.campaigns.some((c) => c.id === published.id);
      store.campaigns = exists
        ? store.campaigns.map((c) => (c.id === published.id ? published : c))
        : [published, ...store.campaigns];
      return delay(published, 400);
    },
    remove: (id: string) => {
      store.campaigns = store.campaigns.filter((c) => c.id !== id);
      return delay(undefined, 250);
    },
    syncStatus: (campaignId: string): Promise<SyncStatusItem[]> => {
      const campaign = store.campaigns.find((c) => c.id === campaignId);
      const targets = store.screens.filter((s) => campaign?.screenIds.includes(s.id));
      const states: SyncStatusItem["state"][] = [
        "Ready",
        "Ready",
        "Downloading",
        "Waiting",
        "Ready",
      ];
      return delay(
        targets.map((s, i) => ({
          screenId: s.id,
          screenName: s.name,
          locationName: s.locationName,
          state: s.status === "offline" ? "Offline" : states[i % states.length]!,
          progress:
            s.status === "offline" ? 0 : states[i % states.length] === "Downloading" ? 78 : 100,
        })),
        450,
      );
    },
  },

  scheduleService: {
    list: () =>
      delay(store.campaigns.filter((c) => c.status !== "Draft" && c.status !== "Archived")),
  },

  userService: {
    list: () => delay(store.users),
    save: (user: User) => {
      const exists = store.users.some((u) => u.id === user.id);
      store.users = exists
        ? store.users.map((u) => (u.id === user.id ? user : u))
        : [user, ...store.users];
      return delay(user, 250);
    },
    remove: (id: string) => {
      store.users = store.users.filter((u) => u.id !== id);
      return delay(true, 200);
    },
    invite: (input) => {
      const user: User = {
        id: `usr-${Date.now()}`,
        name: input.name,
        email: input.email,
        role: input.role,
        locationIds: input.locationIds,
        status: "Invited",
        lastActive: "Never",
      };
      store.users = [user, ...store.users];
      return delay(user, 250);
    },
    create: (input) => {
      const user: User = {
        id: `usr-${Date.now()}`,
        name: input.name,
        email: input.email ?? "",
        username: input.username,
        role: input.role,
        locationIds: input.locationIds,
        status: "Active",
        lastActive: "Never",
      };
      store.users = [user, ...store.users];
      return delay(user, 250);
    },
  },

  dashboardService: {
    summary: async () => {
      const screens = store.screens;
      return delay({
        locations: store.locations.length,
        screens: screens.length,
        online: screens.filter((s) => s.status === "online").length,
        offline: screens.filter((s) => s.status === "offline").length,
        syncing: screens.filter((s) => s.status === "syncing").length,
        activeCampaigns: store.campaigns.filter((c) => c.status === "Active").length,
        scheduledCampaigns: store.campaigns.filter((c) => c.status === "Scheduled").length,
        storageAlerts: db.alerts.filter((a) => a.title === "Storage low").length,
        locationStatus: store.locations.map((l) => ({
          id: l.id,
          name: l.shortName,
          total: screens.filter((s) => s.locationId === l.id).length,
          online: screens.filter((s) => s.locationId === l.id && s.status === "online").length,
        })),
        nowPlaying: screens.filter((s) => s.nowPlaying).slice(0, 5),
        activity: db.activity,
        alerts: db.alerts,
      });
    },
  },

  reportService: {
    proofOfPlay: () => delay(db.proofOfPlay),
    availability: () => delay(db.availability),
    campaignPerformance: () => delay(db.campaignPerformance),
  },
};
