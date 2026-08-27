import { invert, UI_ROLE } from "@e3/shared-types";

import { createUserFn, inviteUserFn, listUsersFn, updateUserFn } from "@/lib/auth-functions";
import type { CmsUserRow } from "@/lib/auth-types";
import { formatLastActive } from "@/lib/relative-time";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { User } from "@/types";
import type { UserService } from "./types";

const ROLE_FROM_UI = invert(UI_ROLE);

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

function toUiUser(row: CmsUserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: UI_ROLE[row.role],
    locationIds: row.locationIds,
    status: row.status === "ACTIVE" ? "Active" : row.status === "INVITED" ? "Invited" : "Disabled",
    lastActive: formatLastActive(row.lastActiveAt),
  };
}

function uuidLocationIds(ids: string[]): string[] {
  return ids.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
  );
}

/** Real CMS users from public.users. Other services can stay on mocks. */
export const liveUserService: UserService = {
  list: async () => {
    const rows = await listUsersFn({ data: { accessToken: await accessToken() } });
    return rows.map(toUiUser);
  },
  save: async (user) => {
    const role = ROLE_FROM_UI[user.role];
    const status =
      user.status === "Disabled" ? "DISABLED" : user.status === "Invited" ? "INVITED" : "ACTIVE";
    const row = await updateUserFn({
      data: {
        accessToken: await accessToken(),
        userId: user.id,
        role,
        locationIds: uuidLocationIds(user.locationIds),
        status,
      },
    });
    return toUiUser(row);
  },
  remove: async () => {
    throw new Error("Deleting users is not enabled. Disable the account instead.");
  },
  invite: async (input) => {
    const result = await inviteUserFn({
      data: {
        accessToken: await accessToken(),
        name: input.name,
        email: input.email,
        role: ROLE_FROM_UI[input.role],
        locationIds: uuidLocationIds(input.locationIds),
      },
    });
    return toUiUser(result.user);
  },
  create: async (input) => {
    const result = await createUserFn({
      data: {
        accessToken: await accessToken(),
        name: input.name,
        username: input.username,
        password: input.password,
        email: input.email?.trim() || "",
        role: ROLE_FROM_UI[input.role],
        locationIds: uuidLocationIds(input.locationIds),
      },
    });
    return toUiUser(result.user);
  },
};
