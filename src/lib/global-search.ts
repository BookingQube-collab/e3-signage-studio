export type GlobalSearchKind =
  | "screen"
  | "media"
  | "campaign"
  | "playlist"
  | "location"
  | "layout";

export type GlobalSearchHit = {
  id: string;
  kind: GlobalSearchKind;
  label: string;
  subtitle: string;
};

const PER_KIND = 5;

function includesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query);
}

/** Ranked flat hits for the header search dropdown (client-side over cached lists). */
export function buildGlobalSearchHits(
  query: string,
  sources: {
    screens?: ReadonlyArray<{ id: string; name: string; locationName: string }>;
    media?: ReadonlyArray<{ id: string; filename: string; type: string; folderName: string | null }>;
    campaigns?: ReadonlyArray<{ id: string; name: string; status: string }>;
    playlists?: ReadonlyArray<{ id: string; name: string; status: string }>;
    locations?: ReadonlyArray<{ id: string; name: string; city: string }>;
    layouts?: ReadonlyArray<{ id: string; name: string; preset: string }>;
  },
): GlobalSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: GlobalSearchHit[] = [];

  const screens = (sources.screens ?? [])
    .filter((s) => includesQuery(s.name, q) || includesQuery(s.locationName, q))
    .slice(0, PER_KIND)
    .map((s) => ({
      id: s.id,
      kind: "screen" as const,
      label: s.name,
      subtitle: s.locationName || "Screen",
    }));
  hits.push(...screens);

  const media = (sources.media ?? [])
    .filter(
      (m) =>
        includesQuery(m.filename, q) ||
        includesQuery(m.type, q) ||
        (m.folderName ? includesQuery(m.folderName, q) : false),
    )
    .slice(0, PER_KIND)
    .map((m) => ({
      id: m.id,
      kind: "media" as const,
      label: m.filename,
      subtitle: m.folderName ? `${m.type} · ${m.folderName}` : m.type,
    }));
  hits.push(...media);

  const campaigns = (sources.campaigns ?? [])
    .filter((c) => includesQuery(c.name, q))
    .slice(0, PER_KIND)
    .map((c) => ({
      id: c.id,
      kind: "campaign" as const,
      label: c.name,
      subtitle: c.status,
    }));
  hits.push(...campaigns);

  const playlists = (sources.playlists ?? [])
    .filter((p) => includesQuery(p.name, q))
    .slice(0, PER_KIND)
    .map((p) => ({
      id: p.id,
      kind: "playlist" as const,
      label: p.name,
      subtitle: p.status,
    }));
  hits.push(...playlists);

  const locations = (sources.locations ?? [])
    .filter((l) => includesQuery(l.name, q) || includesQuery(l.city, q))
    .slice(0, PER_KIND)
    .map((l) => ({
      id: l.id,
      kind: "location" as const,
      label: l.name,
      subtitle: l.city || "Location",
    }));
  hits.push(...locations);

  const layouts = (sources.layouts ?? [])
    .filter((l) => includesQuery(l.name, q) || includesQuery(l.preset, q))
    .slice(0, PER_KIND)
    .map((l) => ({
      id: l.id,
      kind: "layout" as const,
      label: l.name,
      subtitle: l.preset,
    }));
  hits.push(...layouts);

  return hits;
}

export const GLOBAL_SEARCH_KIND_LABEL: Record<GlobalSearchKind, string> = {
  screen: "Screens",
  media: "Media",
  campaign: "Campaigns",
  playlist: "Playlists",
  location: "Locations",
  layout: "Layouts",
};
