import type { CmsProfile } from "@/lib/auth-types";
import { isOrgWideRole } from "@/lib/location-scope";
import { getUserClient } from "./supabase.server";

type UserClient = ReturnType<typeof getUserClient>;

export type ScopedContentUsage = {
  playlistIds: Set<string>;
  layoutIds: Set<string>;
  mediaIds: Set<string>;
};

function asId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function loadScopedContentUsage(
  client: UserClient,
  profile: CmsProfile,
): Promise<ScopedContentUsage> {
  const usage: ScopedContentUsage = {
    playlistIds: new Set<string>(),
    layoutIds: new Set<string>(),
    mediaIds: new Set<string>(),
  };
  try {
    return await loadScopedContentUsageUnsafe(client, profile, usage);
  } catch {
    return usage;
  }
}

async function loadScopedContentUsageUnsafe(
  client: UserClient,
  profile: CmsProfile,
  usage: ScopedContentUsage,
): Promise<ScopedContentUsage> {
  if (isOrgWideRole(profile.role)) return usage;

  const { data: screens } = await client
    .from("screens")
    .select("id, current_playlist_id")
    .eq("organization_id", profile.organizationId)
    .is("archived_at", null);

  const screenIds: string[] = [];
  for (const row of screens ?? []) {
    const id = asId((row as { id: unknown }).id);
    if (id) screenIds.push(id);
    const playlistId = asId((row as { current_playlist_id: unknown }).current_playlist_id);
    if (playlistId) usage.playlistIds.add(playlistId);
  }

  const targetIds = [...new Set([...screenIds, ...(profile.locationIds ?? [])])];
  let campaignIds: string[] = [];
  if (targetIds.length > 0) {
    const { data: targets } = await client
      .from("campaign_targets")
      .select("campaign_id, target_id")
      .in("target_id", targetIds);
    campaignIds = [
      ...new Set(
        (targets ?? [])
          .map((row) => asId((row as { campaign_id: unknown }).campaign_id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  if (campaignIds.length > 0) {
    const { data: campaigns } = await client
      .from("campaigns")
      .select("playlist_id, layout_id")
      .in("id", campaignIds)
      .is("archived_at", null);
    for (const row of campaigns ?? []) {
      const playlistId = asId((row as { playlist_id: unknown }).playlist_id);
      const layoutId = asId((row as { layout_id: unknown }).layout_id);
      if (playlistId) usage.playlistIds.add(playlistId);
      if (layoutId) usage.layoutIds.add(layoutId);
    }
  }

  const playlistList = [...usage.playlistIds];
  if (playlistList.length > 0) {
    const { data: items } = await client
      .from("playlist_items")
      .select("media_id, layout_id")
      .in("playlist_id", playlistList);
    for (const row of items ?? []) {
      const mediaId = asId((row as { media_id: unknown }).media_id);
      const layoutId = asId((row as { layout_id: unknown }).layout_id);
      if (mediaId) usage.mediaIds.add(mediaId);
      if (layoutId) usage.layoutIds.add(layoutId);
    }
  }

  return usage;
}
