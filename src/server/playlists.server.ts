import { randomUUID } from "node:crypto";

import {
  MEDIA_TYPES,
  PLAYLIST_STATUSES,
  TRANSITIONS,
  type MediaType,
  type PlaylistStatus,
  type Transition,
} from "@e3/shared-types";

import { mediaKeysToSign } from "@/lib/media-sign";
import { isUuid } from "@/services/inventory-map";
import type { PlaylistItemRecord, PlaylistRecord } from "@/services/playlist-map";
import { requireCmsPermission } from "./auth.server";
import { assertCanMutateOwnedContent, contentVisibleToProfile } from "@/lib/location-scope";
import { loadScopedContentUsage } from "./scoped-content.server";
import { createObjectDownloadUrls } from "./storage.server";
import { getUserClient } from "./supabase.server";

const PLAYLIST_SELECT = "id, organization_id, name, status, archived_at, created_at, updated_at, created_by";
const ITEM_SELECT =
  "id, playlist_id, media_id, media_version_id, position, duration_seconds, transition, layout_id, priority, audio_media_id, audio_media_version_id";

export type PlaylistItemInput = {
  id: string;
  mediaId: string;
  durationSec: number;
  transition: Transition;
  audioMediaId?: string | null;
};

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

type MediaPreviewUrls = {
  thumbnailUrl: string | null;
  previewUrl: string | null;
};

/** How many leading items get signed thumbs on the playlists index (card/row preview strip). */
const LIST_PREVIEW_ITEM_LIMIT = 4;

type SignPreviewMode = false | "thumbs" | "full";

async function loadSignedMediaUrls(
  client: ReturnType<typeof getUserClient>,
  mediaRows: Array<Record<string, unknown>>,
  signAllPreviews: boolean,
): Promise<Map<string, MediaPreviewUrls>> {
  const out = new Map<string, MediaPreviewUrls>();
  const versionIds = mediaRows
    .map((row) => asNullableString(row["current_version_id"]))
    .filter((id): id is string => Boolean(id));
  if (versionIds.length === 0) return out;

  const { data: versionRows, error } = await client
    .from("media_versions")
    .select("id, storage_key, thumbnail_key, mime_type, status")
    .in("id", versionIds);
  throwIfError(error, "Could not load playlist media files.");

  const versionById = new Map<string, Record<string, unknown>>();
  for (const raw of versionRows ?? []) {
    const row = raw as Record<string, unknown>;
    versionById.set(asString(row["id"]), row);
  }

  const keys: string[] = [];
  const picked = mediaRows.map((row) => {
    const id = asString(row["id"]);
    const current = versionById.get(asString(row["current_version_id"]));
    const status = current ? asString(current["status"]) : "";
    const previewKey =
      current && status === "READY" ? asNullableString(current["storage_key"]) : null;
    const mime = current ? asString(current["mime_type"]).toLowerCase() : "";
    const isImage = mime.startsWith("image/");
    const thumbnailKey =
      asNullableString(current?.["thumbnail_key"]) ?? (isImage ? previewKey : null);
    keys.push(...mediaKeysToSign({ previewKey, thumbnailKey, isImage, signAllPreviews }));
    return { id, previewKey, thumbnailKey, isImage };
  });

  const urls = await createObjectDownloadUrls(keys);
  for (const item of picked) {
    const thumbnailUrl = item.thumbnailKey ? (urls.get(item.thumbnailKey) ?? null) : null;
    // List/thumbs mode: posters only (avoid signing every full video for the index).
    const previewUrl = signAllPreviews
      ? item.previewKey
        ? (urls.get(item.previewKey) ?? null)
        : null
      : item.isImage
        ? (thumbnailUrl ?? (item.previewKey ? (urls.get(item.previewKey) ?? null) : null))
        : null;
    out.set(item.id, { thumbnailUrl, previewUrl });
  }
  return out;
}

function mediaIdsForPreviewSign(
  itemRows: Array<Record<string, unknown>>,
  mode: Exclude<SignPreviewMode, false>,
): Set<string> {
  if (mode === "full") {
    return new Set(
      itemRows.flatMap((row) =>
        [asString(row["media_id"]), asString(row["audio_media_id"])].filter(Boolean),
      ),
    );
  }
  const out = new Set<string>();
  const seenPerPlaylist = new Map<string, number>();
  for (const row of itemRows) {
    const playlistId = asString(row["playlist_id"]);
    const mediaId = asString(row["media_id"]);
    if (!playlistId || !mediaId) continue;
    const count = seenPerPlaylist.get(playlistId) ?? 0;
    if (count >= LIST_PREVIEW_ITEM_LIMIT) continue;
    out.add(mediaId);
    seenPerPlaylist.set(playlistId, count + 1);
  }
  return out;
}

async function toRecords(
  client: ReturnType<typeof getUserClient>,
  rows: Array<Record<string, unknown>>,
  signItemPreviews: SignPreviewMode = false,
): Promise<PlaylistRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => asString(row["id"]));
  const [{ data: itemRows }, { data: screens }] = await Promise.all([
    client.from("playlist_items").select(ITEM_SELECT).in("playlist_id", ids).order("position"),
    client.from("screens").select("current_playlist_id").in("current_playlist_id", ids),
  ]);

  const mediaIds = [
    ...new Set(
      (itemRows ?? []).flatMap((row) => {
        const record = row as { media_id: string; audio_media_id?: string | null };
        return [asString(record.media_id), asString(record.audio_media_id)].filter(Boolean);
      }),
    ),
  ];
  const { data: mediaRows } = mediaIds.length
    ? await client.from("media").select("id, name, type, current_version_id").in("id", mediaIds)
    : { data: [] as Array<Record<string, unknown>> };

  const mediaMeta = new Map<string, { name: string; type: MediaType }>();
  for (const row of mediaRows ?? []) {
    const record = row as Record<string, unknown>;
    const type = asString(record["type"]);
    mediaMeta.set(asString(record["id"]), {
      name: asString(record["name"]),
      type: isMediaType(type) ? type : "IMAGE",
    });
  }

  let signedUrls = new Map<string, MediaPreviewUrls>();
  if (signItemPreviews) {
    const signIds = mediaIdsForPreviewSign(
      (itemRows ?? []) as Array<Record<string, unknown>>,
      signItemPreviews,
    );
    const mediaForSign = ((mediaRows ?? []) as Array<Record<string, unknown>>).filter((row) =>
      signIds.has(asString(row["id"])),
    );
    signedUrls = await loadSignedMediaUrls(client, mediaForSign, signItemPreviews === "full");
  }

  const itemsByPlaylist = new Map<string, PlaylistItemRecord[]>();
  for (const raw of itemRows ?? []) {
    const row = raw as Record<string, unknown>;
    const playlistId = asString(row["playlist_id"]);
    const mediaId = asString(row["media_id"]);
    const meta = mediaMeta.get(mediaId);
    const signed = signedUrls.get(mediaId);
    const transition = asString(row["transition"], "FADE");
    const audioMediaId = asNullableString(row["audio_media_id"]);
    const audioMeta = audioMediaId ? mediaMeta.get(audioMediaId) : undefined;
    const audioSigned = audioMediaId ? signedUrls.get(audioMediaId) : undefined;
    const item: PlaylistItemRecord = {
      id: asString(row["id"]),
      mediaId,
      filename: meta?.name ?? "Missing media",
      type: meta?.type ?? "IMAGE",
      durationSec: Math.max(1, Math.round(asNumber(row["duration_seconds"], 1))),
      transition: isTransition(transition) ? transition : "FADE",
    };
    if (signed?.thumbnailUrl) item.thumbnailUrl = signed.thumbnailUrl;
    if (signed?.previewUrl) item.previewUrl = signed.previewUrl;
    if (audioMediaId && audioMeta?.type === "AUDIO") {
      item.audioMediaId = audioMediaId;
      item.audioFilename = audioMeta.name;
      if (audioSigned?.previewUrl) item.audioUrl = audioSigned.previewUrl;
    }
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
  const [{ data, error }, usage] = await Promise.all([
    client
      .from("playlists")
      .select(PLAYLIST_SELECT)
      .eq("organization_id", auth.profile.organizationId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    loadScopedContentUsage(client, auth.profile),
  ]);
  throwIfError(error, "Could not load playlists.");
  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row) =>
    contentVisibleToProfile(
      auth.profile,
      asNullableString(row["created_by"]),
      usage.playlistIds.has(asString(row["id"])),
    ),
  );
  // Thumbs only for the list strip — full video signing stays on getPlaylist / builder.
  return toRecords(client, rows, "thumbs");
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
    .is("archived_at", null)
    .maybeSingle();
  throwIfError(error, "Could not load playlist.");
  if (!data) return null;
  const usage = await loadScopedContentUsage(client, auth.profile);
  const row = data as Record<string, unknown>;
  if (
    !contentVisibleToProfile(
      auth.profile,
      asNullableString(row["created_by"]),
      usage.playlistIds.has(asString(row["id"])),
    )
  ) {
    return null;
  }
  const records = await toRecords(client, [row], "full");
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
  const audioMediaIds = [
    ...new Set(input.items.map((item) => item.audioMediaId).filter((id): id is string => Boolean(id))),
  ];
  for (const mediaId of mediaIds) {
    if (!isUuid(mediaId)) throw new Error("Playlist items must use media from the library.");
  }
  for (const mediaId of audioMediaIds) {
    if (!isUuid(mediaId)) throw new Error("Image soundtrack must be an MP3 from the library.");
  }
  const lookupIds = [...new Set([...mediaIds, ...audioMediaIds])];
  const { data: mediaRows, error: mediaError } = lookupIds.length
    ? await client
        .from("media")
        .select("id, current_version_id, status, organization_id, type, mime_type")
        .in("id", lookupIds)
        .eq("organization_id", auth.profile.organizationId)
    : {
        data: [] as Array<{
          id: string;
          current_version_id: string | null;
          status: string;
          type: string;
          mime_type: string;
        }>,
        error: null,
      };
  throwIfError(mediaError, "Could not load media for this playlist.");
  const versions = new Map<string, string>();
  const mediaTypeById = new Map<string, string>();
  const mimeById = new Map<string, string>();
  for (const row of mediaRows ?? []) {
    const id = asString((row as { id: string }).id);
    const versionId = asString((row as { current_version_id: string | null }).current_version_id);
    const status = asString((row as { status: string }).status);
    if (!versionId || status !== "READY") {
      throw new Error("Every playlist item must be ready media. Finish uploads first.");
    }
    versions.set(id, versionId);
    mediaTypeById.set(id, asString((row as { type: string }).type));
    mimeById.set(id, asString((row as { mime_type: string }).mime_type).toLowerCase());
  }
  if (versions.size !== lookupIds.length) {
    throw new Error("One or more media items were not found in the library.");
  }
  for (const audioId of audioMediaIds) {
    const type = mediaTypeById.get(audioId);
    const mime = mimeById.get(audioId) ?? "";
    if (type !== "AUDIO" && mime !== "audio/mpeg") {
      throw new Error("Image soundtrack must be an MP3.");
    }
  }

  const existingId = isUuid(input.id) ? input.id : null;
  let playlistId = existingId;
  if (existingId) {
    const { data: existing, error: existingError } = await client
      .from("playlists")
      .select("id, created_by")
      .eq("id", existingId)
      .eq("organization_id", auth.profile.organizationId)
      .maybeSingle();
    throwIfError(existingError, "Could not load playlist.");
    if (!existing) throw new Error("Playlist not found.");
    assertCanMutateOwnedContent(
      auth.profile,
      asNullableString((existing as { created_by: string | null }).created_by),
    );
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
    const payload = input.items.map((item, position) => {
      const visualType = mediaTypeById.get(item.mediaId);
      const audioId =
        visualType === "IMAGE" && item.audioMediaId && versions.has(item.audioMediaId)
          ? item.audioMediaId
          : null;
      return {
        id: isUuid(item.id) ? item.id : randomUUID(),
        playlist_id: playlistId,
        media_id: item.mediaId,
        media_version_id: versions.get(item.mediaId),
        position,
        duration_seconds: Math.max(1, item.durationSec),
        transition: item.transition,
        layout_id: null,
        priority: 10,
        audio_media_id: audioId,
        audio_media_version_id: audioId ? (versions.get(audioId) ?? null) : null,
      };
    });
    const { error: insertError } = await client.from("playlist_items").insert(payload);
    throwIfError(insertError, "Could not save playlist items.");
  }

  const saved = await getPlaylist(accessToken, playlistId);
  if (!saved) throw new Error("Playlist not found.");
  if (isUuid(playlistId)) {
    try {
      const { republishScreensUsingPlaylist } = await import("./campaigns.server");
      await republishScreensUsingPlaylist(accessToken, playlistId);
    } catch (error) {
      console.error(
        "[playlists] republish after save failed",
        playlistId,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return saved;
}

export async function archivePlaylist(accessToken: string, id: string): Promise<boolean> {
  if (!isUuid(id)) throw new Error("Playlist not found.");
  const existing = await getPlaylist(accessToken, id);
  if (!existing) throw new Error("Playlist not found.");
  const auth = await requireCmsPermission(accessToken, "playlists.manage");
  const client = getUserClient(accessToken);
  const { data: row, error: loadError } = await client
    .from("playlists")
    .select("id, created_by")
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId)
    .maybeSingle();
  throwIfError(loadError, "Could not load playlist.");
  if (!row) throw new Error("Playlist not found.");
  assertCanMutateOwnedContent(
    auth.profile,
    asNullableString((row as { created_by: string | null }).created_by),
  );

  const { error: screenError } = await client
    .from("screens")
    .update({ current_playlist_id: null })
    .eq("current_playlist_id", id)
    .eq("organization_id", auth.profile.organizationId);
  throwIfError(screenError, "Could not unassign this playlist from screens.");

  const { error: itemsError } = await client.from("playlist_items").delete().eq("playlist_id", id);
  throwIfError(itemsError, "Could not clear playlist items.");

  const { error } = await client
    .from("playlists")
    .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", auth.profile.organizationId);
  throwIfError(error, "Could not delete playlist.");
  return true;
}
