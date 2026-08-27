import {
  createLocationFn,
  deleteLocationFn,
  getLocationFn,
  listLocationsFn,
  updateLocationFn,
} from "@/lib/inventory-functions";
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
  remove: async (id) => deleteLocationFn({ data: { accessToken: await accessToken(), id } }),
};
