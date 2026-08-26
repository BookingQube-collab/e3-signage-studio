import { invert, UI_LABELS } from "@e3/shared-types";
import type { FitMode, LayoutPreset, Orientation, ZoneContentType } from "@e3/shared-types";

import type { Layout } from "@/types";

export const LAYOUT_PRESET_FROM_UI = invert(UI_LABELS.layoutPreset);
export const FIT_FROM_UI = invert(UI_LABELS.fitMode);
export const ZONE_TYPE_FROM_UI = invert(UI_LABELS.zoneType);
export const ORIENTATION_FROM_UI = invert(UI_LABELS.orientation);

export type LayoutZoneRecord = {
  id: string;
  name: string;
  type: ZoneContentType;
  x: number;
  y: number;
  width: number;
  height: number;
  contentRef: string | null;
  fit: FitMode;
  background: string;
  durationSec: number;
};

export type LayoutRecord = {
  id: string;
  name: string;
  preset: LayoutPreset;
  orientation: Orientation;
  widthPx: number;
  heightPx: number;
  background: string;
  zones: LayoutZoneRecord[];
  usedByScreens: number;
  modifiedAt: string;
};

export function resolutionLabel(widthPx: number, heightPx: number): string {
  return `${widthPx} × ${heightPx}`;
}

export function toUiLayout(row: LayoutRecord): Layout {
  return {
    id: row.id,
    name: row.name,
    preset: UI_LABELS.layoutPreset[row.preset],
    orientation: UI_LABELS.orientation[row.orientation],
    resolution: resolutionLabel(row.widthPx, row.heightPx),
    background: row.background,
    zones: row.zones.map((zone) => {
      const fitLabel = UI_LABELS.fitMode[zone.fit];
      const fit =
        fitLabel === "Fill" || fitLabel === "Cover" || fitLabel === "Contain" || fitLabel === "Stretch"
          ? fitLabel
          : "Contain";
      return {
        id: zone.id,
        name: zone.name,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        contentType: UI_LABELS.zoneType[zone.type],
        contentRef: zone.contentRef,
        fit,
        background: zone.background,
        durationSec: zone.durationSec,
      };
    }),
    modifiedAt: row.modifiedAt,
    usedByScreens: row.usedByScreens,
  };
}
