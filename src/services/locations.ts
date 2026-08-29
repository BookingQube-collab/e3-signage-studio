import {
  createLocationFn,
  deleteLocationFn,
  getLocationFn,
  listLocationsFn,
  updateLocationFn,
} from "@/lib/inventory-functions";
import { updateLocationWaitingScreenFn } from "@/lib/settings-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { Location } from "@/types";
import { LOCATION_STATUS_FROM_UI, LOCATION_TYPE_FROM_UI, toUiLocation } from "./inventory-map";
import type { LocationService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

function toCanonicalLocationInput(input: Omit<Location, "id" | "createdAt">) {
  const type = LOCATION_TYPE_FROM_UI[input.type];
  const status = LOCATION_STATUS_FROM_UI[input.status];
  if (!type) throw new Error("Invalid location type.");
  if (!status) throw new Error("Invalid location status.");
  return {
    name: input.name,
    shortName: input.shortName || input.name,
    city: input.city || "Doha",
    type,
    status,
  };
}

export const liveLocationService: LocationService = {
  list: async () => {
    const rows = await listLocationsFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiLocation);
  },
  get: async (id) => {
    const row = await getLocationFn({ data: { accessToken: await accessToken(), id } });
    return row ? toUiLocation(row) : null;
  },
  create: async (input: Omit<Location, "id" | "createdAt">) => {
    const row = await createLocationFn({
      data: {
        accessToken: await accessToken(),
        ...toCanonicalLocationInput(input),
      },
    });
    return toUiLocation(row);
  },
  update: async (id, input) => {
    const row = await updateLocationFn({
      data: {
        accessToken: await accessToken(),
        id,
        ...toCanonicalLocationInput(input),
      },
    });
    return toUiLocation(row);
  },
  updateWaitingScreen: async (id, input) => {
    const token = await accessToken();
    const waiting = await updateLocationWaitingScreenFn({
      data: {
        accessToken: token,
        locationId: id,
        mediaId: input.mediaId,
        title: input.title,
        message: input.message,
      },
    });
    const row = await getLocationFn({ data: { accessToken: token, id } });
    if (!row) throw new Error("Location not found.");
    return toUiLocation({
      ...row,
      waitingMediaId: waiting.mediaId,
      waitingMediaName: waiting.mediaName,
      waitingThumbnailUrl: waiting.thumbnailUrl,
      waitingTitle: waiting.title,
      waitingMessage: waiting.message,
    });
  },
  remove: async (id) => deleteLocationFn({ data: { accessToken: await accessToken(), id } }),
};
