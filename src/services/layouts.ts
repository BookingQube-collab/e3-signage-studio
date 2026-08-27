import { archiveLayoutFn, getLayoutFn, listLayoutsFn, saveLayoutFn } from "@/lib/content-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { Layout } from "@/types";
import {
  FIT_FROM_UI,
  LAYOUT_PRESET_FROM_UI,
  ORIENTATION_FROM_UI,
  toUiLayout,
  ZONE_TYPE_FROM_UI,
} from "./layout-map";
import type { LayoutService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

function safeToUiLayout(row: Parameters<typeof toUiLayout>[0]) {
  try {
    return toUiLayout(row);
  } catch {
    return null;
  }
}

export const liveLayoutService: LayoutService = {
  list: async () => {
    const rows = await listLayoutsFn({ data: { accessToken: await accessToken() } });
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const layout = safeToUiLayout(row);
      return layout ? [layout] : [];
    });
  },
  get: async (id) => {
    const row = await getLayoutFn({ data: { accessToken: await accessToken(), id } });
    return row ? safeToUiLayout(row) : null;
  },
  save: async (layout: Layout) => {
    const preset = LAYOUT_PRESET_FROM_UI[layout.preset];
    const orientation = ORIENTATION_FROM_UI[layout.orientation];
    if (!preset) throw new Error("Invalid layout preset.");
    if (!orientation) throw new Error("Invalid orientation.");
    const zones = (Array.isArray(layout.zones) ? layout.zones : []).map((zone) => {
      const type = ZONE_TYPE_FROM_UI[zone.contentType];
      const fit = FIT_FROM_UI[zone.fit];
      if (!type) throw new Error(`Unsupported zone type: ${zone.contentType}`);
      if (!fit) throw new Error(`Unsupported fit mode: ${zone.fit}`);
      return {
        id: zone.id,
        name: zone.name,
        type,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        contentRef: zone.contentRef,
        fit,
        background: zone.background,
        durationSec: zone.durationSec,
      };
    });
    const row = await saveLayoutFn({
      data: {
        accessToken: await accessToken(),
        id: layout.id,
        name: layout.name,
        preset,
        orientation,
        resolution: layout.resolution,
        background: layout.background,
        zones,
      },
    });
    const saved = safeToUiLayout(row);
    if (!saved) throw new Error("Could not read the saved layout.");
    return saved;
  },
  remove: async (id) => archiveLayoutFn({ data: { accessToken: await accessToken(), id } }),
};
