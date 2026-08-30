import { invert, UI_LABELS } from "@e3/shared-types";
import type { FitMode, LayoutPreset, Orientation, ZoneContentType } from "@e3/shared-types";

import type { Layout, LayoutPreset as UiLayoutPreset, LayoutZone, Orientation as UiOrientation } from "@/types";

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
  const width = Number.isFinite(widthPx) ? widthPx : 1920;
  const height = Number.isFinite(heightPx) ? heightPx : 1080;
  return `${width} × ${height}`;
}

function presetLabel(preset: LayoutPreset | undefined): UiLayoutPreset {
  const label = preset ? UI_LABELS.layoutPreset[preset] : undefined;
  return label ?? "Custom";
}

function orientationLabel(orientation: Orientation | undefined): UiOrientation {
  const label = orientation ? UI_LABELS.orientation[orientation] : undefined;
  // Layouts only author landscape vs portrait canvas; upside-down is a screen mount option.
  if (label === "Portrait" || label === "Portrait (upside down)") return "Portrait";
  return "Landscape";
}

function zoneTypeLabel(type: ZoneContentType | undefined): LayoutZone["contentType"] {
  const label = type ? UI_LABELS.zoneType[type] : undefined;
  if (
    label === "Video" ||
    label === "Image" ||
    label === "Slideshow" ||
    label === "Text" ||
    label === "QR" ||
    label === "Logo" ||
    label === "Date" ||
    label === "Time"
  ) {
    return label;
  }
  return "Image";
}

function fitLabel(fit: FitMode | undefined): LayoutZone["fit"] {
  const label = fit ? UI_LABELS.fitMode[fit] : undefined;
  return label === "Fill" || label === "Cover" || label === "Contain" || label === "Stretch" ? label : "Contain";
}

function asFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toUiLayout(row: LayoutRecord): Layout {
  const zones = Array.isArray(row?.zones) ? row.zones : [];
  return {
    id: typeof row?.id === "string" ? row.id : "",
    name: typeof row?.name === "string" ? row.name : "",
    preset: presetLabel(row?.preset),
    orientation: orientationLabel(row?.orientation),
    resolution: resolutionLabel(row?.widthPx, row?.heightPx),
    background: typeof row?.background === "string" && row.background ? row.background : "#19161A",
    zones: zones.map((zone) => ({
      id: typeof zone?.id === "string" ? zone.id : "",
      name: typeof zone?.name === "string" ? zone.name : "Zone",
      x: asFinite(zone?.x, 0),
      y: asFinite(zone?.y, 0),
      width: asFinite(zone?.width, 100),
      height: asFinite(zone?.height, 100),
      contentType: zoneTypeLabel(zone?.type),
      contentRef: typeof zone?.contentRef === "string" && zone.contentRef.length > 0 ? zone.contentRef : null,
      fit: fitLabel(zone?.fit),
      background: typeof zone?.background === "string" && zone.background ? zone.background : "#252229",
      durationSec: asFinite(zone?.durationSec, 15),
    })),
    modifiedAt: typeof row?.modifiedAt === "string" ? row.modifiedAt : "",
    usedByScreens: asFinite(row?.usedByScreens, 0),
  };
}
