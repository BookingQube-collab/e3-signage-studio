import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Image,
  LayoutTemplate,
  ListVideo,
  MapPin,
  Megaphone,
  Monitor,
  Search,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import type { CmsProfile } from "@/lib/auth-types";
import {
  buildGlobalSearchHits,
  GLOBAL_SEARCH_KIND_LABEL,
  type GlobalSearchHit,
  type GlobalSearchKind,
} from "@/lib/global-search";
import { hasPermission } from "@/lib/rbac";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import {
  campaignService,
  layoutService,
  locationService,
  mediaService,
  playlistService,
  screenService,
} from "@/services";

const KIND_ICON: Record<GlobalSearchKind, typeof Monitor> = {
  screen: Monitor,
  media: Image,
  campaign: Megaphone,
  playlist: ListVideo,
  location: MapPin,
  layout: LayoutTemplate,
};

function navigateToHit(
  navigate: ReturnType<typeof useNavigate>,
  hit: GlobalSearchHit,
): void {
  switch (hit.kind) {
    case "screen":
      void navigate({ to: "/screens/$id", params: { id: hit.id } });
      break;
    case "media":
      void navigate({ to: "/media" });
      break;
    case "campaign":
      void navigate({ to: "/campaigns/$id", params: { id: hit.id } });
      break;
    case "playlist":
      void navigate({ to: "/playlists/$id", params: { id: hit.id } });
      break;
    case "location":
      void navigate({ to: "/locations/$id", params: { id: hit.id } });
      break;
    case "layout":
      void navigate({ to: "/layouts/$id", params: { id: hit.id } });
      break;
  }
}

export function GlobalSearch({ profile }: { profile: CmsProfile | null }) {
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebouncedValue(query.trim(), 150);
  const searching = debounced.length >= 1;

  const canScreens = Boolean(profile && hasPermission(profile.role, "screens.view"));
  const canMedia = Boolean(profile && hasPermission(profile.role, "media.view"));
  const canCampaigns = Boolean(profile && hasPermission(profile.role, "campaigns.view"));
  const canPlaylists = Boolean(profile && hasPermission(profile.role, "playlists.view"));
  const canLocations = Boolean(profile && hasPermission(profile.role, "locations.view"));
  const canLayouts = Boolean(profile && hasPermission(profile.role, "layouts.view"));

  const screensQuery = useQuery({
    queryKey: ["screens"],
    queryFn: screenService.list,
    enabled: searching && canScreens,
  });
  const mediaQuery = useQuery({
    queryKey: ["media"],
    queryFn: mediaService.list,
    enabled: searching && canMedia,
  });
  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignService.list,
    enabled: searching && canCampaigns,
  });
  const playlistsQuery = useQuery({
    queryKey: ["playlists"],
    queryFn: playlistService.list,
    enabled: searching && canPlaylists,
  });
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: locationService.list,
    enabled: searching && canLocations,
  });
  const layoutsQuery = useQuery({
    queryKey: ["layouts"],
    queryFn: layoutService.list,
    enabled: searching && canLayouts,
  });

  const hits = useMemo(() => {
    const sources: Parameters<typeof buildGlobalSearchHits>[1] = {};
    if (canScreens && screensQuery.data) sources.screens = screensQuery.data;
    if (canMedia && mediaQuery.data) sources.media = mediaQuery.data;
    if (canCampaigns && campaignsQuery.data) sources.campaigns = campaignsQuery.data;
    if (canPlaylists && playlistsQuery.data) sources.playlists = playlistsQuery.data;
    if (canLocations && locationsQuery.data) sources.locations = locationsQuery.data;
    if (canLayouts && layoutsQuery.data) sources.layouts = layoutsQuery.data;
    return buildGlobalSearchHits(debounced, sources);
  }, [
    debounced,
    canScreens,
    canMedia,
    canCampaigns,
    canPlaylists,
    canLocations,
    canLayouts,
    screensQuery.data,
    mediaQuery.data,
    campaignsQuery.data,
    playlistsQuery.data,
    locationsQuery.data,
    layoutsQuery.data,
  ]);

  const loading =
    searching &&
    ((canScreens && screensQuery.isLoading) ||
      (canMedia && mediaQuery.isLoading) ||
      (canCampaigns && campaignsQuery.isLoading) ||
      (canPlaylists && playlistsQuery.isLoading) ||
      (canLocations && locationsQuery.isLoading) ||
      (canLayouts && layoutsQuery.isLoading));

  const showPanel = open && searching;

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced]);

  useEffect(() => {
    if (!showPanel) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showPanel]);

  function selectHit(hit: GlobalSearchHit) {
    setOpen(false);
    setQuery("");
    navigateToHit(navigate, hit);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (query) {
        event.preventDefault();
        setQuery("");
        setOpen(false);
      }
      return;
    }

    if (!searching || hits.length === 0) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % hits.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[activeIndex] ?? hits[0];
      if (hit) selectHit(hit);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search screens, media, campaigns…"
        aria-label="Global search"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showPanel}
        role="combobox"
        autoComplete="off"
        className="h-10 rounded-xl border-border bg-card pl-9"
      />

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-md"
        >
          {loading && hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results for “{debounced}”
            </p>
          ) : (
            hits.map((hit, index) => {
              const Icon = KIND_ICON[hit.kind];
              const active = index === activeIndex;
              return (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectHit(hit)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{hit.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {GLOBAL_SEARCH_KIND_LABEL[hit.kind]}
                      {hit.subtitle ? ` · ${hit.subtitle}` : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
