import {
  createScreenGroupFn,
  listScreenGroupsFn,
  removeScreenGroupFn,
  updateScreenGroupFn,
} from "@/lib/inventory-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import { isUuid, toUiScreenGroup } from "./inventory-map";
import type { ScreenGroupService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

export const liveScreenGroupService: ScreenGroupService = {
  list: async () => {
    const rows = await listScreenGroupsFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiScreenGroup);
  },
  create: async (input) => {
    const row = await createScreenGroupFn({
      data: {
        accessToken: await accessToken(),
        name: input.name,
        description: input.description,
        screenIds: input.screenIds.filter(isUuid),
      },
    });
    return toUiScreenGroup(row);
  },
  update: async (id, patch) => {
    const data: {
      accessToken: string;
      id: string;
      name?: string;
      description?: string;
      screenIds?: string[];
    } = {
      accessToken: await accessToken(),
      id,
    };
    if (patch.name != null) data.name = patch.name;
    if (patch.description != null) data.description = patch.description;
    if (patch.screenIds) data.screenIds = patch.screenIds.filter(isUuid);
    const row = await updateScreenGroupFn({ data });
    return toUiScreenGroup(row);
  },
  remove: async (id) => removeScreenGroupFn({ data: { accessToken: await accessToken(), id } }),
};
