import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { OrganizationSettingsDto } from "@/server/settings.server";

const accessTokenSchema = z.object({ accessToken: z.string().min(1) });

export const getOrganizationSettingsFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<OrganizationSettingsDto> => {
    const { getOrganizationSettings } = await import("@/server/settings.server");
    return getOrganizationSettings(data.accessToken);
  });

export const updateWaitingScreenSettingsFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      mediaId: z.string().uuid().nullable(),
      title: z.string().max(120).nullable(),
      message: z.string().max(500).nullable(),
    }),
  )
  .handler(async ({ data }): Promise<OrganizationSettingsDto> => {
    const { updateWaitingScreenSettings } = await import("@/server/settings.server");
    const { accessToken, ...input } = data;
    return updateWaitingScreenSettings(accessToken, input);
  });
