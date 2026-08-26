export type DeviceLayoutZoneJson = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: string;
  contentRef: string | null;
  background: string;
  durationSeconds: number;
};

export type DeviceLayoutJson = {
  widthPx: number;
  heightPx: number;
  orientation: "LANDSCAPE" | "PORTRAIT";
  background: string;
  zones: DeviceLayoutZoneJson[];
};

export function clampPercent(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function percentToPx(percent: number, total: number): number {
  if (!Number.isFinite(percent) || !Number.isFinite(total) || total <= 0) return 0;
  const px = Math.round((clampPercent(percent) / 100) * total);
  return Math.min(total, Math.max(0, px));
}

export function parseLayoutResolution(
  resolution: string,
  orientation: "LANDSCAPE" | "PORTRAIT",
): { widthPx: number; heightPx: number } {
  const nums = resolution.match(/\d+/g);
  const first = nums?.[0];
  const second = nums?.[1];
  if (first && second) {
    const width = Number(first);
    const height = Number(second);
    if (width > 0 && height > 0) return { widthPx: width, heightPx: height };
  }
  return orientation === "PORTRAIT" ? { widthPx: 1080, heightPx: 1920 } : { widthPx: 1920, heightPx: 1080 };
}

export function zonePercentForDb(value: number, { min }: { min: number }): number {
  return Math.round(clampPercent(value, min, 100) * 1000) / 1000;
}

export function toDeviceLayoutJson(input: {
  widthPx: number;
  heightPx: number;
  orientation: "LANDSCAPE" | "PORTRAIT";
  background: string;
  zones: Array<{
    id: string;
    name: string;
    type: string;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
    fit: string;
    contentRef: string | null;
    background: string;
    durationSeconds: number;
  }>;
}): DeviceLayoutJson {
  return {
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    orientation: input.orientation,
    background: input.background,
    zones: input.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      type: zone.type,
      x: percentToPx(zone.xPercent, input.widthPx),
      y: percentToPx(zone.yPercent, input.heightPx),
      width: Math.max(1, percentToPx(zone.widthPercent, input.widthPx)),
      height: Math.max(1, percentToPx(zone.heightPercent, input.heightPx)),
      fit: zone.fit,
      contentRef: zone.contentRef,
      background: zone.background,
      durationSeconds: zone.durationSeconds,
    })),
  };
}
