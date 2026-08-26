import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { USER_ROLES } from "@e3/shared-types";

import type { AuthSessionResult, CmsUserRow, LocationOption } from "@/lib/auth-types";

function roleEnum() {
  return z.enum(USER_ROLES);
}

export const persistSessionFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { persistAuthCookies } = await import("@/server/auth.server");
    return persistAuthCookies(data.accessToken, data.refreshToken);
  });

export const clearSessionFn = createServerFn({ method: "POST" }).handler(async () => {
  const { clearAuthSession } = await import("@/server/auth.server");
  return clearAuthSession();
});

export const getAuthSessionFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string() }))
  .handler(async ({ data }): Promise<AuthSessionResult> => {
    const { resolveAuthFromRequest } = await import("@/server/auth.server");
    return resolveAuthFromRequest(data.accessToken);
  });

export const listUsersFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string() }))
  .handler(async ({ data }): Promise<CmsUserRow[]> => {
    const { listCmsUsers } = await import("@/server/auth.server");
    return listCmsUsers(data.accessToken);
  });

export const listLocationOptionsFn = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string() }))
  .handler(async ({ data }): Promise<LocationOption[]> => {
    const { listLocationOptions } = await import("@/server/auth.server");
    return listLocationOptions(data.accessToken);
  });

export const inviteUserFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      name: z.string().trim().min(1).max(200),
      email: z.string().email(),
      role: roleEnum(),
      locationIds: z.array(z.string().uuid()),
    }),
  )
  .handler(async ({ data }) => {
    const { inviteCmsUser } = await import("@/server/auth.server");
    return inviteCmsUser(data);
  });

export const updateUserFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      accessToken: z.string(),
      userId: z.string().uuid(),
      role: roleEnum(),
      locationIds: z.array(z.string().uuid()),
    }),
  )
  .handler(async ({ data }) => {
    const { updateCmsUser } = await import("@/server/auth.server");
    return updateCmsUser(data);
  });
