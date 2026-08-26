import { randomUUID } from "node:crypto";

import {
  MEDIA_TYPES,
  PLAYLIST_STATUSES,
  TRANSITIONS,
  type MediaType,
  type PlaylistStatus,
  type Transition,
} from "@e3/shared-types";

import { isUuid } from "@/services/inventory-map";
import type { PlaylistItemRecord, PlaylistRecord } from "@/services/playlist-map";
import { requireCmsPermission } from "./auth.server";
import { getUserClient } from "./supabase.server";

const PLAYLIST_SELECT = "id, organization_id, name, status, archived_at, created_at, updated_at, created_by";
const ITEM_SELECT =
  "id, playlist_id, media_id, media_version_id, position, duration_seconds, transition, layout_id, priority";

export type PlaylistItemInput = {
  id: string;
  mediaId: string;
  durationSec: number;
  transition: Transition;
};

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isPlaylistStatus(value: string): value is PlaylistStatus {
  return (PLAYLIST_STATUSES as readonly string[]).includes(value);
}

function isTransition(value: string): value is Transition {
  return (TRANSITIONS as readonly string[]).includes(value);
}

function isMediaType(value: string): value is MediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value);
}

function dateLabel(iso: string): string {
  return iso.slice(0, 10);
}

async function toRecords(
  client: ReturnType<typeof getUserClient>,
  rows: Array<Record<string, unknown>>,
): Promise<PlaylistRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => asString(row["id"]));
  const [{ data: itemRows, error: itemError }, { data: screens }] = await Promise.all([
    client.from("playlist_items").select(ITEM_SELECT).in("playlist_id", ids).order("position"),
    client.from("screens").select("current_playlist_id").in("current_playlist_id", ids),
  ]);
  throwIfError(itemError, "Could not load playlist items.");

  const mediaIds = [
    ...new Set((itemRows ?? []).map((row) => asString((row as { media_id: string }).media_id))),
  ].filter(Boolean);
  const { data: mediaRows } = mediaIds.length
    ? await client.from("media").select("id, name, type").in("id", mediaIds)
    : { data: [] as Array<{ id: string; name: string; type: string }> };

  const mediaMeta = new Map<string, { name: string; type: MediaType }>();
  for (const row of mediaRows ?? []) {
    const type = asString((row as { type: string }).type);
    mediaMeta.set(asString((row as { id: string }).id), {
      name: asString((row as { name: string }).name),
      type: isMediaType(type) ? type : "IMAGE",
    });
  }

  const itemsByPlaylist = new Map<string, PlaylistItemRecord[]>();
  for (const raw of itemRows ?? []) {
    const row = raw as Record<string, unknown>;
    const playlistId = asString(row["playlist_id"]);
    const mediaId = asString(row["media_id"]);
    const meta = mediaMeta.get(mediaId);
    const transition = asString(row["transition"], "FADE");
    const item: PlaylistItemRecord = {
      id: asString(row["id"]),
      mediaId,
      filename: meta?.name ?? "Missing media",
      type: meta?.type ?? "IMAGE",
      durationSec: Math.max(1, Math.round(asNumber(row["duration_seconds"], 1))),
      transition: isTransition(transition) ? transition : "FADE",
    };
    const list = itemsByPlaylist.get(playlistId) ?? [];
    list.push(item);
    itemsByPlaylist.set(playlistId, list);
  }

  const used = new Map<string, number>();
  for (const row of screens ?? []) {
    const playlistId = asString((row as { current_playlist_id: string }).current_playlist_id);
    used.set(playlistId, (used.get(playlistId) ?? 0) + 1);
  }

  return rows
    .filter((row) => !row["archived_at"])
    .map((row) => {
      const status = asString(row["status"], "DRAFT");
      return {
        id: asString(row["id"]),
        name: asString(row["name"]),
        status: isPlaylistStatus(status) ? status : "DRAFT",
        items: itemsByPlaylist.get(asString(row["id"])) ?? [],
        usedByScreens: used.get(asString(row["id"])) ?? 0,
        modifiedAt: dateLabel(asString(row["updated_at"])),
      };
    });
}

export async function listPlaylists(accessToken: string): Promise<PlaylistRecord[]> {
  const auth = await requireCmsPermission(accessToken, "playlists.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("playlists")
    .select(PLAYLIST_SELECT)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  throwIfError(error, "Could not load playlists.");
  return toRecords(client, (data ?? []) as Array<Record<string, unknown>>);
}

export async function getPlaylist(accessToken: string, id: string): Promise<PlaylistRecord | null> {
  const auth = await requireCmsPermission(accessToken, "playlists.view");
  if (!isUuid(id)) return null;
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("playlists")
    .select(PLAYLIST_SELECT)
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId)
    .maybeSingle();
  throwIfError(error, "Could not load playlist.");
  if (!data) return null;
  const records = await toRecords(client, [data as Record<string, unknown>]);
  return records[0] ?? null;
}

export async function savePlaylist(
  accessToken: string,
  input: {
    id: string;
    name: string;
    status: PlaylistStatus;
    items: PlaylistItemInput[];
  },
): Promise<PlaylistRecord> {
  const auth = await requireCmsPermission(accessToken, "playlists.manage");
  const client = getUserClient(accessToken);
  const name = input.name.trim();
  if (!name) throw new Error("Name your playlist before saving.");
  if (input.status !== "DRAFT" && input.items.length === 0) {
    throw new Error("Add at least one media item before publishing.");
  }

  const mediaIds = [...new Set(input.items.map((item) => item.mediaId))];
  for (const mediaId of mediaIds) {
    if (!isUuid(mediaId)) throw new Error("Playlist items must use media from the library.");
  }
  const { data: mediaRows, error: mediaError } = mediaIds.length
    ? await client
        .from("media")
        .select("id, current_version_id, status, organization_id")
        .in("id", mediaIds)
        .eq("organization_id", auth.profile.organizationId)
    : { data: [] as Array<{ id: string; current_version_id: string | null; status: string }>, error: null };
  throwIfError(mediaError, "Could not load media for this playlist.");
  const versions = new Map<string, string>();
  for (const row of mediaRows ?? []) {
    const id = asString((row as { id: string }).id);
    const versionId = asString((row as { current_version_id: string | null }).current_version_id);
    const status = asString((row as { status: string }).status);
    if (!versionId || status !== "READY") {
      throw new Error("Every playlist item must be ready media. Finish uploads first.");
    }
    versions.set(id, versionId);
  }
  if (versions.size !== mediaIds.length) {
    throw new Error("One or more media items were not found in the library.");
  }

  const existingId = isUuid(input.id) ? input.id : null;
  let playlistId = existingId;
  if (existingId) {
    const { data: existing, error: existingError } = await client
      .from("playlists")
      .select("id")
      .eq("id", existingId)
      .eq("organization_id", auth.profile.organizationId)
      .maybeSingle();
    throwIfError(existingError, "Could not load playlist.");
    if (!existing) throw new Error("Playlist not found.");
    const { error: updateError } = await client
      .from("playlists")
      .update({ name, status: input.status })
      .eq("id", existingId);
    throwIfError(updateError, "Could not save playlist.");
  } else {
    const { data, error } = await client
      .from("playlists")
      .insert({
        organization_id: auth.profile.organizationId,
        name,
        status: input.status,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    throwIfError(error, "Could not create playlist.");
    playlistId = asString((data as { id: string }).id);
  }
  if (!playlistId) throw new Error("Could not save playlist.");

  const { error: deleteError } = await client.from("playlist_items").delete().eq("playlist_id", playlistId);
  throwIfError(deleteError, "Could not update playlist items.");

  if (input.items.length > 0) {
    const payload = input.items.map((item, position) => ({
      id: isUuid(item.id) ? item.id : randomUUID(),
      playlist_id: playlistId,
      media_id: item.mediaId,
      media_version_id: versions.get(item.mediaId),
      position,
      duration_seconds: Math.max(1, item.durationSec),
      transition: item.transition,
      layout_id: null,
      priority: 10,
    }));
    const { error: insertError } = await client.from("playlist_items").insert(payload);
    throwIfError(insertError, "Could not save playlist items.");
  }

  const saved = await getPlaylist(accessToken, playlistId);
  if (!saved) throw new Error("Playlist not found.");
  return saved;
}
