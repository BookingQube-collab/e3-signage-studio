import {
  MEDIA_STATUSES,
  MEDIA_TYPES,
  type MediaStatus,
  type MediaType,
} from "@e3/shared-types";
import type { AllowedMediaMime } from "@e3/validation";

import type { MediaRecord } from "@/services/media-map";
import { requireCmsPermission } from "./auth.server";
import type { MediaRow, MediaVersionRow } from "./db/types";
import { buildStorageKey, hueFromChecksum, mediaTypeFromMime, normalizeChecksum, safeMediaFilename } from "../lib/media-file";
import {
  createObjectDownloadUrl,
  createObjectDownloadUrls,
  createObjectUploadUrl,
  deleteObjects,
  statObject,
  storageBackendName,
  UPLOAD_URL_TTL_SECONDS,
} from "./storage.server";
import { getUserClient } from "./supabase.server";

const MEDIA_SELECT =
  "id, organization_id, name, type, mime_type, current_version_id, status, archived_at, created_at, updated_at, created_by, uploaded_by";
const VERSION_SELECT =
  "id, media_id, version_number, storage_key, thumbnail_key, size_bytes, width, height, duration_ms, checksum_sha256, mime_type, status, created_at, created_by";

type UsedIn = MediaRecord["usedIn"];

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

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isMediaType(value: string): value is MediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value);
}

function isMediaStatus(value: string): value is MediaStatus {
  return (MEDIA_STATUSES as readonly string[]).includes(value);
}

function dateLabel(iso: string): string {
  return iso.slice(0, 10);
}

function mapVersion(row: Record<string, unknown>): MediaVersionRow {
  return {
    id: asString(row["id"]),
    media_id: asString(row["media_id"]),
    version_number: asNumber(row["version_number"]),
    storage_key: asString(row["storage_key"]),
    thumbnail_key: asNullableString(row["thumbnail_key"]),
    size_bytes: asNumber(row["size_bytes"]),
    width: asNullableNumber(row["width"]),
    height: asNullableNumber(row["height"]),
    duration_ms: asNullableNumber(row["duration_ms"]),
    checksum_sha256: asString(row["checksum_sha256"]),
    mime_type: asString(row["mime_type"]),
    status: asString(row["status"]),
    created_at: asString(row["created_at"]),
    created_by: asNullableString(row["created_by"]),
  };
}

function mapMedia(row: Record<string, unknown>): MediaRow {
  return {
    id: asString(row["id"]),
    organization_id: asString(row["organization_id"]),
    name: asString(row["name"]),
    type: asString(row["type"]),
    mime_type: asString(row["mime_type"]),
    current_version_id: asNullableString(row["current_version_id"]),
    status: asString(row["status"]),
    archived_at: asNullableString(row["archived_at"]),
    created_at: asString(row["created_at"]),
    updated_at: asString(row["updated_at"]),
    created_by: asNullableString(row["created_by"]),
    uploaded_by: asNullableString(row["uploaded_by"]),
  };
}

function dimensionsOf(version: MediaVersionRow | undefined): string {
  if (!version?.width || !version.height) return "—";
  return `${version.width} × ${version.height}`;
}

async function loadUsedIn(
  client: ReturnType<typeof getUserClient>,
  mediaIds: string[],
): Promise<Map<string, UsedIn>> {
  const map = new Map<string, UsedIn>();
  for (const id of mediaIds) {
    map.set(id, { playlists: [], campaigns: [], screens: [] });
  }
  if (mediaIds.length === 0) return map;

  const { data: itemRows } = await client
    .from("playlist_items")
    .select("media_id, playlist_id")
    .in("media_id", mediaIds);
  const playlistIds = [
    ...new Set((itemRows ?? []).map((row) => asString((row as { playlist_id: string }).playlist_id))),
  ].filter(Boolean);

  const [{ data: playlists }, { data: campaigns }, { data: screens }] = await Promise.all([
    playlistIds.length > 0
      ? client.from("playlists").select("id, name").in("id", playlistIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    playlistIds.length > 0
      ? client.from("campaigns").select("id, name, playlist_id").in("playlist_id", playlistIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; playlist_id: string }> }),
    client.from("screens").select("name, currently_playing_media_id").in("currently_playing_media_id", mediaIds),
  ]);

  const playlistName = new Map<string, string>();
  for (const row of playlists ?? []) {
    playlistName.set(asString((row as { id: string }).id), asString((row as { name: string }).name));
  }
  for (const row of itemRows ?? []) {
    const mediaId = asString((row as { media_id: string }).media_id);
    const name = playlistName.get(asString((row as { playlist_id: string }).playlist_id));
    const entry = map.get(mediaId);
    if (entry && name && !entry.playlists.includes(name)) entry.playlists.push(name);
  }
  for (const row of campaigns ?? []) {
    const playlistId = asString((row as { playlist_id: string }).playlist_id);
    const mediaIdsForPlaylist = (itemRows ?? [])
      .filter((item) => asString((item as { playlist_id: string }).playlist_id) === playlistId)
      .map((item) => asString((item as { media_id: string }).media_id));
    const name = asString((row as { name: string }).name);
    for (const mediaId of mediaIdsForPlaylist) {
      const entry = map.get(mediaId);
      if (entry && name && !entry.campaigns.includes(name)) entry.campaigns.push(name);
    }
  }
  for (const row of screens ?? []) {
    const mediaId = asString((row as { currently_playing_media_id: string }).currently_playing_media_id);
    const name = asString((row as { name: string }).name);
    const entry = map.get(mediaId);
    if (entry && name && !entry.screens.includes(name)) entry.screens.push(name);
  }
  return map;
}

async function toRecords(
  client: ReturnType<typeof getUserClient>,
  mediaRows: MediaRow[],
): Promise<MediaRecord[]> {
  if (mediaRows.length === 0) return [];
  const ids = mediaRows.map((row) => row.id);
  const uploaderIds = [
    ...new Set(mediaRows.map((row) => row.uploaded_by).filter((id): id is string => Boolean(id))),
  ];

  const [{ data: versionRows, error: versionError }, { data: users }, usedIn] = await Promise.all([
    client.from("media_versions").select(VERSION_SELECT).in("media_id", ids),
    uploaderIds.length > 0
      ? client.from("users").select("id, name").in("id", uploaderIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    loadUsedIn(client, ids),
  ]);
  throwIfError(versionError, "Could not load media versions.");

  const versionsByMedia = new Map<string, MediaVersionRow[]>();
  for (const raw of versionRows ?? []) {
    const version = mapVersion(raw as Record<string, unknown>);
    const list = versionsByMedia.get(version.media_id) ?? [];
    list.push(version);
    versionsByMedia.set(version.media_id, list);
  }

  const names = new Map<string, string>();
  for (const row of users ?? []) {
    names.set(asString((row as { id: string }).id), asString((row as { name: string }).name));
  }

  const thumbKeys: string[] = [];
  const picked = mediaRows.map((row) => {
    const versions = (versionsByMedia.get(row.id) ?? []).sort(
      (a, b) => b.version_number - a.version_number,
    );
    const current =
      versions.find((v) => v.id === row.current_version_id) ?? versions[0];
    const image =
      current &&
      current.status === "READY" &&
      current.mime_type.startsWith("image/") &&
      current.storage_key
        ? current.storage_key
        : null;
    if (image) thumbKeys.push(image);
    return { row, current, image };
  });

  const thumbs = await createObjectDownloadUrls(thumbKeys);

  return picked.map(({ row, current, image }) => {
    const type = isMediaType(row.type) ? row.type : "IMAGE";
    const status = isMediaStatus(row.status) ? row.status : "PROCESSING";
    const checksum = current?.checksum_sha256 ?? row.id.replace(/-/g, "").slice(0, 64);
    const sizeBytes = current?.size_bytes ?? 0;
    return {
      id: row.id,
      filename: row.name,
      type,
      mimeType: row.mime_type,
      status,
      dimensions: dimensionsOf(current),
      durationSec: current?.duration_ms ? Math.round(current.duration_ms / 1000) : null,
      sizeMb: Number((sizeBytes / 1_000_000).toFixed(1)),
      modifiedAt: dateLabel(row.updated_at),
      uploadedBy: (row.uploaded_by && names.get(row.uploaded_by)) || "Team member",
      uploadedAt: dateLabel(row.created_at),
      version: current ? `v${current.version_number}` : "v1",
      thumbnailHue: hueFromChecksum(checksum),
      thumbnailUrl: image ? (thumbs.get(image) ?? null) : null,
      usedIn: usedIn.get(row.id) ?? { playlists: [], campaigns: [], screens: [] },
    };
  });
}

async function getMediaRow(
  client: ReturnType<typeof getUserClient>,
  id: string,
  organizationId: string,
): Promise<MediaRow | null> {
  const { data, error } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  throwIfError(error, "Could not load media.");
  return data ? mapMedia(data as Record<string, unknown>) : null;
}

export async function listMedia(accessToken: string): Promise<MediaRecord[]> {
  const auth = await requireCmsPermission(accessToken, "media.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: false });
  throwIfError(error, "Could not load media.");
  const rows = (data ?? []).map((row) => mapMedia(row as Record<string, unknown>));
  return toRecords(client, rows);
}

export async function getMedia(accessToken: string, id: string): Promise<MediaRecord | null> {
  const auth = await requireCmsPermission(accessToken, "media.view");
  const client = getUserClient(accessToken);
  const row = await getMediaRow(client, id, auth.profile.organizationId);
  if (!row || row.archived_at) return null;
  const records = await toRecords(client, [row]);
  return records[0] ?? null;
}

export type UploadIntentInput = {
  filename: string;
  mimeType: AllowedMediaMime;
  sizeBytes: number;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mediaId: string | null;
};

export type UploadIntentResult = {
  mediaId: string;
  mediaVersionId: string;
  versionNumber: number;
  storageKey: string;
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  uploadHeaders: Record<string, string>;
  expiresInSeconds: number;
};

export async function createUploadIntent(
  accessToken: string,
  input: UploadIntentInput,
): Promise<UploadIntentResult> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const checksum = normalizeChecksum(input.checksumSha256);
  const filename = safeMediaFilename(input.filename);
  const type = mediaTypeFromMime(input.mimeType);
  const orgId = auth.profile.organizationId;

  let mediaId = input.mediaId;
  let versionNumber = 1;

  if (mediaId) {
    const existing = await getMediaRow(client, mediaId, orgId);
    if (!existing) throw new Error("Media not found.");
    if (existing.archived_at || existing.status === "ARCHIVED") {
      throw new Error("Archived media cannot be replaced.");
    }
    await client
      .from("media_versions")
      .update({ status: "FAILED" })
      .eq("media_id", mediaId)
      .eq("status", "PROCESSING");
    const { data: latest, error: latestError } = await client
      .from("media_versions")
      .select("version_number")
      .eq("media_id", mediaId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(latestError, "Could not read media versions.");
    const latestNumber =
      latest && typeof latest === "object" && "version_number" in latest
        ? asNumber((latest as { version_number: unknown }).version_number, 0)
        : 0;
    versionNumber = latestNumber + 1;
    const { error: touchError } = await client
      .from("media")
      .update({
        mime_type: input.mimeType,
        type,
        status: "PROCESSING",
        uploaded_by: auth.userId,
      })
      .eq("id", mediaId);
    throwIfError(touchError, "Could not update media.");
  } else {
    const { data, error } = await client
      .from("media")
      .insert({
        organization_id: orgId,
        name: filename,
        type,
        mime_type: input.mimeType,
        status: "PROCESSING",
        created_by: auth.userId,
        uploaded_by: auth.userId,
      })
      .select(MEDIA_SELECT)
      .single();
    throwIfError(error, "Could not create media.");
    mediaId = asString((data as { id: string }).id);
  }

  if (!mediaId) throw new Error("Could not create media.");

  const storageKey = buildStorageKey({
    organizationId: orgId,
    mediaId,
    versionNumber,
    checksumSha256: checksum,
    mime: input.mimeType,
  });

  const { data: version, error: versionError } = await client
    .from("media_versions")
    .insert({
      media_id: mediaId,
      version_number: versionNumber,
      storage_key: storageKey,
      thumbnail_key: null,
      size_bytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      duration_ms: input.durationMs,
      checksum_sha256: checksum,
      mime_type: input.mimeType,
      status: "PROCESSING",
      created_by: auth.userId,
    })
    .select(VERSION_SELECT)
    .single();
  throwIfError(versionError, "Could not create media version.");

  const signed = await createObjectUploadUrl(storageKey, input.mimeType, accessToken);
  return {
    mediaId,
    mediaVersionId: asString((version as { id: string }).id),
    versionNumber,
    storageKey,
    uploadUrl: signed.url,
    uploadMethod: signed.method,
    uploadHeaders: signed.headers,
    expiresInSeconds: signed.expiresInSeconds || UPLOAD_URL_TTL_SECONDS,
  };
}

async function statWithRetry(key: string): Promise<{ sizeBytes: number } | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stat = await statObject(key);
    if (stat) return stat;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

export async function completeUpload(
  accessToken: string,
  input: { mediaVersionId: string; checksumSha256: string },
): Promise<MediaRecord> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const checksum = normalizeChecksum(input.checksumSha256);

  const { data: versionRaw, error: versionError } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .eq("id", input.mediaVersionId)
    .maybeSingle();
  throwIfError(versionError, "Could not load media version.");
  if (!versionRaw) throw new Error("Upload session not found.");
  const version = mapVersion(versionRaw as Record<string, unknown>);
  if (version.checksum_sha256 !== checksum) {
    throw new Error("Checksum mismatch.");
  }

  const media = await getMediaRow(client, version.media_id, auth.profile.organizationId);
  if (!media) throw new Error("Media not found.");

  if (version.status === "READY" && media.current_version_id === version.id) {
    const records = await toRecords(client, [media]);
    const ready = records[0];
    if (!ready) throw new Error("Media not found.");
    return ready;
  }

  const stat = await statWithRetry(version.storage_key);
  if (!stat) {
    await client.from("media_versions").update({ status: "FAILED" }).eq("id", version.id);
    await client.from("media").update({ status: "FAILED" }).eq("id", media.id);
    throw new Error("Upload did not reach storage. Try again.");
  }
  if (stat.sizeBytes >= 0 && stat.sizeBytes !== version.size_bytes) {
    await client.from("media_versions").update({ status: "FAILED" }).eq("id", version.id);
    await client.from("media").update({ status: "FAILED" }).eq("id", media.id);
    throw new Error("Uploaded file size does not match.");
  }

  const thumbnailKey = version.mime_type.startsWith("image/") ? version.storage_key : null;
  const { error: versionUpdateError } = await client
    .from("media_versions")
    .update({ status: "READY", thumbnail_key: thumbnailKey })
    .eq("id", version.id);
  throwIfError(versionUpdateError, "Could not finalize media version.");

  const { error: mediaUpdateError } = await client
    .from("media")
    .update({
      status: "READY",
      current_version_id: version.id,
      mime_type: version.mime_type,
    })
    .eq("id", media.id);
  throwIfError(mediaUpdateError, "Could not finalize media.");

  const updated = await getMediaRow(client, media.id, auth.profile.organizationId);
  if (!updated) throw new Error("Media not found.");
  const records = await toRecords(client, [updated]);
  const result = records[0];
  if (!result) throw new Error("Media not found.");
  return result;
}

export async function renameMedia(
  accessToken: string,
  id: string,
  filename: string,
): Promise<MediaRecord> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const existing = await getMediaRow(client, id, auth.profile.organizationId);
  if (!existing) throw new Error("Media not found.");
  const { error } = await client
    .from("media")
    .update({ name: safeMediaFilename(filename) })
    .eq("id", id);
  throwIfError(error, "Could not rename media.");
  const updated = await getMediaRow(client, id, auth.profile.organizationId);
  if (!updated) throw new Error("Media not found.");
  const records = await toRecords(client, [updated]);
  const result = records[0];
  if (!result) throw new Error("Media not found.");
  return result;
}

export async function archiveMedia(accessToken: string, id: string): Promise<MediaRecord> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const existing = await getMediaRow(client, id, auth.profile.organizationId);
  if (!existing) throw new Error("Media not found.");
  const { error } = await client
    .from("media")
    .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
    .eq("id", id);
  throwIfError(error, "Could not archive media.");
  const updated = await getMediaRow(client, id, auth.profile.organizationId);
  if (!updated) throw new Error("Media not found.");
  const records = await toRecords(client, [updated]);
  const result = records[0];
  if (!result) throw new Error("Media not found.");
  return result;
}

export async function deleteMedia(accessToken: string, id: string): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const existing = await getMediaRow(client, id, auth.profile.organizationId);
  if (!existing) throw new Error("Media not found.");

  const { count, error: usedError } = await client
    .from("playlist_items")
    .select("id", { count: "exact", head: true })
    .eq("media_id", id);
  throwIfError(usedError, "Could not check media usage.");
  if ((count ?? 0) > 0) {
    throw new Error("This media is used in a playlist. Archive it instead of deleting.");
  }

  const { data: versions, error: versionError } = await client
    .from("media_versions")
    .select("storage_key, thumbnail_key")
    .eq("media_id", id);
  throwIfError(versionError, "Could not load media versions.");
  const keys = [
    ...new Set(
      (versions ?? []).flatMap((row) => {
        const storageKey = asNullableString((row as { storage_key: string }).storage_key);
        const thumb = asNullableString((row as { thumbnail_key: string | null }).thumbnail_key);
        return [storageKey, thumb].filter((value): value is string => Boolean(value));
      }),
    ),
  ];

  const { error: clearCurrent } = await client
    .from("media")
    .update({ current_version_id: null })
    .eq("id", id);
  throwIfError(clearCurrent, "Could not delete media.");
  const { error: deleteVersions } = await client.from("media_versions").delete().eq("media_id", id);
  throwIfError(deleteVersions, "Could not delete media versions.");
  const { error: deleteRow } = await client.from("media").delete().eq("id", id);
  throwIfError(deleteRow, "Could not delete media.");

  try {
    await deleteObjects(keys);
  } catch {
    // DB row is already gone; leftover objects can be cleaned by a later storage sweep.
  }
  return true;
}

export async function mediaDownloadUrl(
  accessToken: string,
  id: string,
): Promise<{ url: string; filename: string }> {
  const auth = await requireCmsPermission(accessToken, "media.view");
  const client = getUserClient(accessToken);
  const media = await getMediaRow(client, id, auth.profile.organizationId);
  if (!media || media.archived_at) throw new Error("Media not found.");
  if (!media.current_version_id) {
    throw new Error("This file is not ready to download yet.");
  }
  const { data, error } = await client
    .from("media_versions")
    .select("storage_key, status")
    .eq("id", media.current_version_id)
    .maybeSingle();
  throwIfError(error, "Could not load media file.");
  const storageKey = asNullableString((data as { storage_key?: string } | null)?.["storage_key"]);
  const status = asString((data as { status?: string } | null)?.["status"]);
  if (!storageKey || status !== "READY") {
    throw new Error("This file is not ready to download yet.");
  }
  const url = await createObjectDownloadUrl(storageKey, 300);
  return { url, filename: media.name };
}

export function mediaStorageBackend(): "r2" | "supabase" {
  return storageBackendName();
}
