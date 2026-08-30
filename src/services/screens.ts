import {
  getScreenFn,
  listScreensByLocationFn,
  listScreensFn,
  pairScreenFn,
  repairScreenFn,
  syncNowFn,
  unpairScreenFn,
  updateScreenFn,
} from "@/lib/inventory-functions";
import { deviceLogsFn } from "@/lib/monitoring-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { Screen } from "@/types";
import { isUuid, ORIENTATION_FROM_UI, toUiScreen } from "./inventory-map";
import type { ScreenService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

function parsePatchResolution(patch: Partial<Screen>): { width?: number; height?: number } {
  if (!patch.resolution) return {};
  const nums = patch.resolution.match(/\d+/g);
  const first = nums?.[0];
  const second = nums?.[1];
  if (!first || !second) return {};
  let width = Number(first);
  let height = Number(second);
  if (width <= 0 || height <= 0) return {};
  // Portrait + landscape-labeled resolution (e.g. 1920×1080) → swap to logical canvas.
  if (patch.orientation === "Portrait" && width > height) {
    const tmp = width;
    width = height;
    height = tmp;
  } else if (patch.orientation === "Landscape" && height > width) {
    const tmp = width;
    width = height;
    height = tmp;
  }
  return { width, height };
}

export const liveScreenService: ScreenService = {
  list: async () => {
    const rows = await listScreensFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiScreen);
  },
  get: async (id) => {
    const row = await getScreenFn({ data: { accessToken: await accessToken(), id } });
    return row ? toUiScreen(row) : null;
  },
  listByLocation: async (locationId) => {
    const rows = await listScreensByLocationFn({
      data: { accessToken: await accessToken(), locationId },
    });
    return rows.map(toUiScreen);
  },
  pair: async (input) => {
    const orientation = ORIENTATION_FROM_UI[input.orientation];
    if (!orientation) throw new Error("Invalid orientation.");
    const row = await pairScreenFn({
      data: {
        accessToken: await accessToken(),
        code: input.code,
        name: input.name,
        locationId: input.locationId,
        screenType: input.screenType,
        orientation,
        resolution: input.resolution,
        groupIds: input.groupIds.filter(isUuid),
      },
    });
    return toUiScreen(row);
  },
  repair: async (id, code) => {
    const row = await repairScreenFn({
      data: { accessToken: await accessToken(), id, code },
    });
    return toUiScreen(row);
  },
  update: async (id, patch) => {
    const orientation = patch.orientation ? ORIENTATION_FROM_UI[patch.orientation] : undefined;
    if (patch.orientation && !orientation) throw new Error("Invalid orientation.");
    const size = parsePatchResolution(patch);
    const operationalStatus =
      patch.status === "disabled" ? "DISABLED" : patch.status === "online" ? "READY" : undefined;
    const playlistId =
      patch.playlistId === null
        ? null
        : patch.playlistId && isUuid(patch.playlistId)
          ? patch.playlistId
          : undefined;
    if (patch.playlistId && playlistId === undefined) {
      throw new Error("Playlists are not connected yet. Live playlists land in a later phase.");
    }

    const data: {
      accessToken: string;
      id: string;
      name?: string;
      screenType?: string;
      orientation?: NonNullable<typeof orientation>;
      width?: number;
      height?: number;
      operationalStatus?: "DISABLED" | "READY";
      groupIds?: string[];
      playlistId?: string | null;
    } = {
      accessToken: await accessToken(),
      id,
    };
    if (patch.name != null) data.name = patch.name;
    if (patch.screenType != null) data.screenType = patch.screenType;
    if (orientation) data.orientation = orientation;
    if (size.width != null) data.width = size.width;
    if (size.height != null) data.height = size.height;
    if (operationalStatus) data.operationalStatus = operationalStatus;
    if (patch.groupIds) data.groupIds = patch.groupIds.filter(isUuid);
    if (playlistId !== undefined) data.playlistId = playlistId;

    const row = await updateScreenFn({ data });
    return toUiScreen(row);
  },
  syncNow: async (id) => {
    const row = await syncNowFn({ data: { accessToken: await accessToken(), id } });
    return toUiScreen(row);
  },
  unpair: async (id) => unpairScreenFn({ data: { accessToken: await accessToken(), id } }),
  logs: async (id) => deviceLogsFn({ data: { accessToken: await accessToken(), screenId: id } }),
};
