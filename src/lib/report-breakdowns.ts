import type { AvailabilityRow, CampaignPerformanceRow, ProofOfPlayRow } from "@/types";

export type NamedCount = { name: string; value: number };
export type NamedPct = { name: string; value: number; screens?: number };
export type TopContentRow = {
  media: string;
  campaign: string;
  plays: number;
  durationMin: number;
  successRate: number;
};
export type ScreenPlayRow = {
  screen: string;
  location: string;
  plays: number;
  successRate: number;
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function sumBy(
  rows: ProofOfPlayRow[],
  keyFn: (row: ProofOfPlayRow) => string,
  valueFn: (row: ProofOfPlayRow) => number = (r) => r.playCount,
): NamedCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row).trim() || "—";
    map.set(key, (map.get(key) ?? 0) + valueFn(row));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Infer media type from filename extension — operational mix, not audience demographics. */
export function mediaTypeFromName(media: string): string {
  const ext = media.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext)) return "Video";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext)) return "Image";
  if (["pdf"].includes(ext)) return "Document";
  if (["html", "htm"].includes(ext)) return "HTML";
  return "Other";
}

export function playsByLocation(rows: ProofOfPlayRow[]): NamedCount[] {
  return sumBy(rows, (r) => r.location);
}

export function playsByCampaign(rows: ProofOfPlayRow[]): NamedCount[] {
  return sumBy(rows, (r) => (r.campaign === "—" ? "Unassigned" : r.campaign));
}

export function playsByMediaType(rows: ProofOfPlayRow[]): NamedCount[] {
  return sumBy(rows, (r) => mediaTypeFromName(r.media));
}

export function playsByDay(rows: ProofOfPlayRow[]): NamedCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!day) continue;
    map.set(day, (map.get(day) ?? 0) + row.playCount);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Day-of-week distribution from proof-of-play dates (UTC calendar day). */
export function playsByWeekday(rows: ProofOfPlayRow[]): NamedCount[] {
  const map = new Map<string, number>(DAY_ORDER.map((d) => [d, 0]));
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    // JS: 0=Sun … 6=Sat → Mon-first labels
    const label = DAY_ORDER[weekday === 0 ? 6 : weekday - 1];
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + row.playCount);
  }
  return DAY_ORDER.map((name) => ({ name, value: map.get(name) ?? 0 }));
}

export function topContent(rows: ProofOfPlayRow[], limit = 5): TopContentRow[] {
  const map = new Map<
    string,
    { media: string; campaign: string; plays: number; durationMin: number; completedWeight: number }
  >();
  for (const row of rows) {
    const key = `${row.media}|${row.campaign}`;
    const existing = map.get(key);
    if (existing) {
      existing.plays += row.playCount;
      existing.durationMin += row.totalDurationMin;
      existing.completedWeight += row.successRate * row.playCount;
      continue;
    }
    map.set(key, {
      media: row.media,
      campaign: row.campaign,
      plays: row.playCount,
      durationMin: row.totalDurationMin,
      completedWeight: row.successRate * row.playCount,
    });
  }
  return [...map.values()]
    .map((row) => ({
      media: row.media,
      campaign: row.campaign,
      plays: row.plays,
      durationMin: row.durationMin,
      successRate: row.plays === 0 ? 0 : Math.round(row.completedWeight / row.plays),
    }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit);
}

export function playsByScreen(rows: ProofOfPlayRow[]): ScreenPlayRow[] {
  const map = new Map<
    string,
    { screen: string; location: string; plays: number; completedWeight: number }
  >();
  for (const row of rows) {
    const key = `${row.location}|${row.screen}`;
    const existing = map.get(key);
    if (existing) {
      existing.plays += row.playCount;
      existing.completedWeight += row.successRate * row.playCount;
      continue;
    }
    map.set(key, {
      screen: row.screen,
      location: row.location,
      plays: row.playCount,
      completedWeight: row.successRate * row.playCount,
    });
  }
  return [...map.values()]
    .map((row) => ({
      screen: row.screen,
      location: row.location,
      plays: row.plays,
      successRate: row.plays === 0 ? 0 : Math.round(row.completedWeight / row.plays),
    }))
    .sort((a, b) => a.plays - b.plays);
}

export function uptimeByLocation(rows: AvailabilityRow[]): NamedPct[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const key = row.location.trim() || "—";
    const existing = map.get(key) ?? { total: 0, count: 0 };
    existing.total += row.onlinePct;
    existing.count += 1;
    map.set(key, existing);
  }
  return [...map.entries()]
    .map(([name, agg]) => ({
      name,
      value: agg.count === 0 ? 0 : Math.round(agg.total / agg.count),
      screens: agg.count,
    }))
    .sort((a, b) => a.value - b.value);
}

export function lowestUptimeScreens(rows: AvailabilityRow[], limit = 5): AvailabilityRow[] {
  return [...rows].sort((a, b) => a.onlinePct - b.onlinePct).slice(0, limit);
}

export function campaignChartRows(rows: CampaignPerformanceRow[]): NamedCount[] {
  return rows.map((r) => ({ name: r.campaign, value: r.plays })).sort((a, b) => b.value - a.value);
}

export function campaignCompletionRows(rows: CampaignPerformanceRow[]): NamedCount[] {
  return rows
    .map((r) => ({ name: r.campaign, value: r.completionRate }))
    .sort((a, b) => b.value - a.value);
}

export function uniqueScreensPlayed(rows: ProofOfPlayRow[]): number {
  return new Set(rows.map((r) => `${r.location}|${r.screen}`)).size;
}

export function uniqueMediaPlayed(rows: ProofOfPlayRow[]): number {
  return new Set(rows.map((r) => r.media)).size;
}
