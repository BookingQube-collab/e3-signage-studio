import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  FIT_MODES,
  LAYOUT_PRESETS,
  ORIENTATIONS,
  PLAYLIST_STATUSES,
  TRANSITIONS,
  ZONE_CONTENT_TYPES,
} from "@e3/shared-types";

import type { LayoutRecord } from "@/services/layout-map";
import type { PlaylistRecord } from "@/services/playlist-map";

const accessTokenSchema = z.object({ accessToken: z.string() });

function playlistStatusEnum() {
  return z.enum(PLAYLIST_STATUSES);
}
function transitionEnum() {
  return z.enum(TRANSITIONS);
}
function presetEnum() {
  return z.enum(LAYOUT_PRESETS);
}
function orientationEnum() {
  return z.enum(ORIENTATIONS);
}
function fitEnum() {
  return z.enum(FIT_MODES);
}
function zoneTypeEnum() {
  return z.enum(ZONE_CONTENT_TYPES);
}

export const listPlaylistsFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<PlaylistRecord[]> => {
    const { listPlaylists } = await import("@/server/playlists.server");
    return listPlaylists(data.accessToken);
  });

export const getPlaylistFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<PlaylistRecord | null> => {
    const { getPlaylist } = await import("@/server/playlists.server");
    return getPlaylist(data.accessToken, data.id);
  });

export const savePlaylistFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      id: z.string().min(1),
      name: z.string(),
      status: playlistStatusEnum(),
      items: z.array(
        z.object({
          id: z.string().min(1),
          mediaId: z.string().min(1),
          durationSec: z.number().positive(),
          transition: transitionEnum(),
          audioMediaId: z.string().uuid().nullable().optional(),
        }),
      ),
    }),
  )
  .handler(async ({ data }): Promise<PlaylistRecord> => {
    const { savePlaylist } = await import("@/server/playlists.server");
    const { accessToken, ...input } = data;
    return savePlaylist(accessToken, input);
  });

export const listLayoutsFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema)
  .handler(async ({ data }): Promise<LayoutRecord[]> => {
    const { listLayouts } = await import("@/server/layouts.server");
    return listLayouts(data.accessToken);
  });

export const getLayoutFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<LayoutRecord | null> => {
    const { getLayout } = await import("@/server/layouts.server");
    return getLayout(data.accessToken, data.id);
  });

export const saveLayoutFn = createServerFn({ method: "POST" })
  .validator(
    accessTokenSchema.extend({
      id: z.string().min(1),
      name: z.string(),
      preset: presetEnum(),
      orientation: orientationEnum(),
      resolution: z.string().min(1).max(40),
      background: z.string().min(1).max(32),
      zones: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().max(80),
          type: zoneTypeEnum(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          contentRef: z.string().nullable(),
          fit: fitEnum(),
          background: z.string().min(1).max(32),
          durationSec: z.number().min(0),
        }),
      ),
    }),
  )
  .handler(async ({ data }): Promise<LayoutRecord> => {
    const { saveLayout } = await import("@/server/layouts.server");
    const { accessToken, ...input } = data;
    return saveLayout(accessToken, input);
  });

export const archivePlaylistFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<boolean> => {
    const { archivePlaylist } = await import("@/server/playlists.server");
    return archivePlaylist(data.accessToken, data.id);
  });

export const archiveLayoutFn = createServerFn({ method: "POST" })
  .validator(accessTokenSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<boolean> => {
    const { archiveLayout } = await import("@/server/layouts.server");
    return archiveLayout(data.accessToken, data.id);
  });
