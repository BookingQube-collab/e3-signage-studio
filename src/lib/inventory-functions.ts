import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  LOCATION_STATUSES,
  LOCATION_TYPES,
  ORIENTATIONS,
  SCREEN_OPERATIONAL_STATUSES,
} from "@e3/shared-types";

import type { LocationRecord, ScreenGroupRecord, ScreenRecord } from "@/services/inventory-map";

function locationTypeEnum() {
  return z.enum(LOCATION_TYPES);
}
function locationStatusEnum() {
  return z.enum(LOCATION_STATUSES);
}
function orientationEnum() {
  return z.enum(ORIENTATIONS);
}
function operationalEnum() {
  return z.enum(SCREEN_OPERATIONAL_STATUSES);
}

export const listLocationsFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string() }))
  .handler(async ({ data }): Promise<LocationRecord[]> => {
    const { listLocations } = await import("@/server/inventory.server");
    return listLocations(data.accessToken);
  });

export const getLocationFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string(), id: z.string().uuid() }))
  .handler(async ({ data }): Promise<LocationRecord | null> => {
    const { getLocation } = await import("@/server/inventory.server");
    return getLocation(data.accessToken, data.id);
  });

export const createLocationFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      name: z.string().trim().min(1).max(200),
      shortName: z.string().trim().min(1).max(80),
      city: z.string().max(120),
      type: locationTypeEnum(),
      status: locationStatusEnum(),
    }),
  )
  .handler(async ({ data }): Promise<LocationRecord> => {
    const { createLocation } = await import("@/server/inventory.server");
    return createLocation(data.accessToken, data);
  });

export const listScreensFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string() }))
  .handler(async ({ data }): Promise<ScreenRecord[]> => {
    const { listScreens } = await import("@/server/inventory.server");
    return listScreens(data.accessToken);
  });

export const getScreenFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string(), id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ScreenRecord | null> => {
    const { getScreen } = await import("@/server/inventory.server");
    return getScreen(data.accessToken, data.id);
  });

export const listScreensByLocationFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string(), locationId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ScreenRecord[]> => {
    const { listScreensByLocation } = await import("@/server/inventory.server");
    return listScreensByLocation(data.accessToken, data.locationId);
  });

export const pairScreenFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      code: z.string().min(6).max(12),
      name: z.string().trim().min(1).max(200),
      locationId: z.string().uuid(),
      screenType: z.string().min(1).max(80),
      orientation: orientationEnum(),
      resolution: z.string().min(1).max(40),
      groupIds: z.array(z.string().uuid()),
    }),
  )
  .handler(async ({ data }): Promise<ScreenRecord> => {
    const { pairScreen } = await import("@/server/inventory.server");
    return pairScreen(data.accessToken, data);
  });

export const updateScreenFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      screenType: z.string().min(1).max(80).optional(),
      orientation: orientationEnum().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      operationalStatus: operationalEnum().optional(),
      groupIds: z.array(z.string().uuid()).optional(),
      playlistId: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ScreenRecord> => {
    const { updateScreen } = await import("@/server/inventory.server");
    const { accessToken, id, ...patch } = data;
    return updateScreen(accessToken, id, patch);
  });

export const syncNowFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string(), id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ScreenRecord> => {
    const { requestScreenSync } = await import("@/server/inventory.server");
    return requestScreenSync(data.accessToken, data.id);
  });

export const unpairScreenFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string(), id: z.string().uuid() }))
  .handler(async ({ data }): Promise<boolean> => {
    const { unpairScreen } = await import("@/server/inventory.server");
    return unpairScreen(data.accessToken, data.id);
  });

export const listScreenGroupsFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string() }))
  .handler(async ({ data }): Promise<ScreenGroupRecord[]> => {
    const { listScreenGroups } = await import("@/server/inventory.server");
    return listScreenGroups(data.accessToken);
  });

export const createScreenGroupFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      name: z.string().trim().min(1).max(200),
      description: z.string().max(1000),
      screenIds: z.array(z.string().uuid()),
    }),
  )
  .handler(async ({ data }): Promise<ScreenGroupRecord> => {
    const { createScreenGroup } = await import("@/server/inventory.server");
    return createScreenGroup(data.accessToken, data);
  });

export const updateScreenGroupFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      screenIds: z.array(z.string().uuid()).optional(),
    }),
  )
  .handler(async ({ data }): Promise<ScreenGroupRecord> => {
    const { updateScreenGroup } = await import("@/server/inventory.server");
    const { accessToken, id, ...patch } = data;
    return updateScreenGroup(accessToken, id, patch);
  });

export const removeScreenGroupFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string(), id: z.string().uuid() }))
  .handler(async ({ data }): Promise<boolean> => {
    const { removeScreenGroup } = await import("@/server/inventory.server");
    return removeScreenGroup(data.accessToken, data.id);
  });
