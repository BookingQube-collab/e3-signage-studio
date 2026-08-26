import {
  MEDIA_STATUSES,
  MEDIA_TYPES,
  type MediaStatus,
  type MediaType,
} from "@e3/shared-types";
import type { AllowedMediaMime } from "@e3/validation";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  parseUploadByteLimit,
} from "@e3/validation";

import type { MediaFolderRecord, MediaRecord } from "@/services/media-map";
import { assertBulkDeleteAllowed, MAX_BULK_MEDIA_IDS } from "../lib/media-bulk";
import {
  assertUploadSize,
  buildStorageKey,
  hueFromChecksum,
  mediaTypeFromMime,
  normalizeChecksum,
  safeMediaFilename,
} from "../lib/media-file";
import {
  FOLDER_DUPLICATE_MESSAGE,
  assertFolderDeletable,
  assertFolderName,
  isDuplicateFolderName,
} from "../lib/media-folders";
import { requireCmsPermission } from "./auth.server";
import type { MediaFolderRow, MediaRow, MediaVersionRow } from "./db/types";
import { getServerEnv } from "./env.server";
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
  "id, organization_id, name, type, mime_type, current_version_id, status, archived_at, folder_id, created_at, updated_at, created_by, uploaded_by";
const FOLDER_SELECT = "id, organization_id, name, created_at, updated_at, created_by";
const VERSION_SELECT =
  "id, media_id, version_number, storage_key, thumbnail_key, size_bytes, width, height, duration_ms, checksum_sha256, mime_type, status, created_at, created_by";

type UsedIn = MediaRecord["usedIn"];

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function serverUploadLimits(): { imageBytes: number; videoBytes: number } {
  const env = getServerEnv();
  return {
    imageBytes: parseUploadByteLimit(env.mediaMaxImageBytes, MAX_IMAGE_UPLOAD_BYTES),
    videoBytes: parseUploadByteLimit(env.mediaMaxVideoBytes, MAX_VIDEO_UPLOAD_BYTES),
  };
}

function uniqueMediaIds(ids: string[]): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length > MAX_BULK_MEDIA_IDS) {
    throw new Error(`Select ${MAX_BULK_MEDIA_IDS} files or fewer.`);
  }
  return unique;
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
    folder_id: asNullableString(row["folder_id"]),
  };
}

function mapFolder(row: Record<string, unknown>): MediaFolderRow {
  return {
    id: asString(row["id"]),
    organization_id: asString(row["organization_id"]),
    name: asString(row["name"]),
    created_at: asString(row["created_at"]),
    updated_at: asString(row["updated_at"]),
    created_by: asNullableString(row["created_by"]),
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

  const folderIds = [
    ...new Set(mediaRows.map((row) => row.folder_id).filter((id): id is string => Boolean(id))),
  ];

  const [{ data: versionRows, error: versionError }, { data: users }, { data: folderRows }, usedIn] =
    await Promise.all([
      client.from("media_versions").select(VERSION_SELECT).in("media_id", ids),
      uploaderIds.length > 0
        ? client.from("users").select("id, name").in("id", uploaderIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      folderIds.length > 0
        ? client.from("media_folders").select("id, name").in("id", folderIds)
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
  const folderNames = new Map<string, string>();
  for (const row of folderRows ?? []) {
    folderNames.set(asString((row as { id: string }).id), asString((row as { name: string }).name));
  }

  const previewKeys: string[] = [];
  const picked = mediaRows.map((row) => {
    const versions = (versionsByMedia.get(row.id) ?? []).sort(
      (a, b) => b.version_number - a.version_number,
    );
    const current =
      versions.find((v) => v.id === row.current_version_id) ?? versions[0];
    const previewKey =
      current && current.status === "READY" && current.storage_key ? current.storage_key : null;
    const image = previewKey && current?.mime_type.startsWith("image/") ? previewKey : null;
    if (previewKey) previewKeys.push(previewKey);
    return { row, current, image, previewKey };
  });

  const urls = await createObjectDownloadUrls(previewKeys);

  return picked.map(({ row, current, image, previewKey }) => {
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
      thumbnailUrl: image ? (urls.get(image) ?? null) : null,
      previewUrl: previewKey ? (urls.get(previewKey) ?? null) : null,
      folderId: row.folder_id,
      folderName: row.folder_id ? (folderNames.get(row.folder_id) ?? null) : null,
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

async function getFolderRow(
  client: ReturnType<typeof getUserClient>,
  id: string,
  organizationId: string,
): Promise<MediaFolderRow | null> {
  const { data, error } = await client
    .from("media_folders")
    .select(FOLDER_SELECT)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  throwIfError(error, "Could not load folder.");
  return data ? mapFolder(data as Record<string, unknown>) : null;
}

async function requireFolderId(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null;
  const folder = await getFolderRow(client, folderId, organizationId);
  if (!folder) throw new Error("Folder not found.");
  return folder.id;
}

async function visibleFileCount(
  client: ReturnType<typeof getUserClient>,
  folderId: string,
): Promise<number> {
  const { count, error } = await client
    .from("media")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", folderId)
    .is("archived_at", null)
    .neq("status", "ARCHIVED");
  throwIfError(error, "Could not count folder files.");
  return count ?? 0;
}

async function toFolderRecord(
  client: ReturnType<typeof getUserClient>,
  row: MediaFolderRow,
): Promise<MediaFolderRecord> {
  return {
    id: row.id,
    name: row.name,
    createdAt: dateLabel(row.created_at),
    fileCount: await visibleFileCount(client, row.id),
  };
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
  folderId: string | null;
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
  assertUploadSize(input.mimeType, input.sizeBytes, serverUploadLimits());
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
    const folderId = await requireFolderId(client, orgId, input.folderId);
    const { data, error } = await client
      .from("media")
      .insert({
        organization_id: orgId,
        name: filename,
        type,
        mime_type: input.mimeType,
        status: "PROCESSING",
        folder_id: folderId,
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
  await assertIdsDeletable(client, [existing]);
  await purgeMediaRow(client, id);
  return true;
}

export async function deleteMediaBulk(accessToken: string, ids: string[]): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const unique = uniqueMediaIds(ids);
  if (unique.length === 0) return true;
  const rows = await getMediaRows(client, unique, auth.profile.organizationId);
  if (rows.length !== unique.length) throw new Error("Some files were not found.");
  await assertIdsDeletable(client, rows);
  for (const row of rows) {
    await purgeMediaRow(client, row.id);
  }
  return true;
}

async function getMediaRows(
  client: ReturnType<typeof getUserClient>,
  ids: string[],
  organizationId: string,
): Promise<MediaRow[]> {
  const { data, error } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .in("id", ids)
    .eq("organization_id", organizationId);
  throwIfError(error, "Could not load media.");
  return (data ?? []).map((row) => mapMedia(row as Record<string, unknown>));
}

async function assertIdsDeletable(
  client: ReturnType<typeof getUserClient>,
  rows: MediaRow[],
): Promise<void> {
  const ids = rows.map((row) => row.id);
  const { data: itemRows, error } = await client
    .from("playlist_items")
    .select("media_id")
    .in("media_id", ids);
  throwIfError(error, "Could not check media usage.");
  const usedIds = new Set(
    (itemRows ?? []).map((row) => asString((row as { media_id: string }).media_id)),
  );
  if (usedIds.size === 0) return;
  if (rows.length === 1) {
    throw new Error("This media is used in a playlist. Archive it instead of deleting.");
  }
  const usedIn = await loadUsedIn(client, [...usedIds]);
  const blocked = rows
    .filter((row) => usedIds.has(row.id))
    .map((row) => ({
      filename: row.name,
      usedIn: usedIn.get(row.id) ?? { playlists: [], campaigns: [], screens: [] },
    }));
  assertBulkDeleteAllowed(blocked);
}

async function purgeMediaRow(client: ReturnType<typeof getUserClient>, id: string): Promise<void> {
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

export async function listFolders(accessToken: string): Promise<MediaFolderRecord[]> {
  const auth = await requireCmsPermission(accessToken, "media.view");
  const client = getUserClient(accessToken);
  const orgId = auth.profile.organizationId;
  const { data, error } = await client
    .from("media_folders")
    .select(FOLDER_SELECT)
    .eq("organization_id", orgId)
    .order("name", { ascending: true });
  throwIfError(error, "Could not load folders.");
  const folders = (data ?? []).map((row) => mapFolder(row as Record<string, unknown>));
  if (folders.length === 0) return [];

  const { data: mediaRows, error: countError } = await client
    .from("media")
    .select("folder_id")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .neq("status", "ARCHIVED")
    .not("folder_id", "is", null);
  throwIfError(countError, "Could not count folder files.");
  const counts = new Map<string, number>();
  for (const row of mediaRows ?? []) {
    const folderId = asNullableString((row as { folder_id: string | null }).folder_id);
    if (!folderId) continue;
    counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
  }
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    createdAt: dateLabel(folder.created_at),
    fileCount: counts.get(folder.id) ?? 0,
  }));
}

export async function createFolder(accessToken: string, name: string): Promise<MediaFolderRecord> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const orgId = auth.profile.organizationId;
  const normalized = assertFolderName(name);
  const { data: existing, error: existingError } = await client
    .from("media_folders")
    .select("name")
    .eq("organization_id", orgId);
  throwIfError(existingError, "Could not load folders.");
  const names = (existing ?? []).map((row) => asString((row as { name: string }).name));
  if (isDuplicateFolderName(names, normalized)) {
    throw new Error(FOLDER_DUPLICATE_MESSAGE);
  }
  const { data, error } = await client
    .from("media_folders")
    .insert({
      organization_id: orgId,
      name: normalized,
      created_by: auth.userId,
    })
    .select(FOLDER_SELECT)
    .single();
  if (error?.code === "23505") throw new Error(FOLDER_DUPLICATE_MESSAGE);
  throwIfError(error, "Could not create folder.");
  return toFolderRecord(client, mapFolder(data as Record<string, unknown>));
}

export async function deleteFolder(accessToken: string, id: string): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const existing = await getFolderRow(client, id, auth.profile.organizationId);
  if (!existing) throw new Error("Folder not found.");
  assertFolderDeletable(await visibleFileCount(client, id));
  const { error } = await client.from("media_folders").delete().eq("id", id);
  throwIfError(error, "Could not delete folder.");
  return true;
}

export async function moveMediaToFolder(
  accessToken: string,
  id: string,
  folderId: string | null,
): Promise<MediaRecord> {
  const moved = await moveMediaBulk(accessToken, [id], folderId);
  const result = moved[0];
  if (!result) throw new Error("Media not found.");
  return result;
}

export async function moveMediaBulk(
  accessToken: string,
  ids: string[],
  folderId: string | null,
): Promise<MediaRecord[]> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const unique = uniqueMediaIds(ids);
  if (unique.length === 0) return [];
  const existing = await getMediaRows(client, unique, auth.profile.organizationId);
  if (existing.length !== unique.length) throw new Error("Some files were not found.");
  const nextFolderId = await requireFolderId(client, auth.profile.organizationId, folderId);
  const { error } = await client
    .from("media")
    .update({ folder_id: nextFolderId })
    .in("id", unique)
    .eq("organization_id", auth.profile.organizationId);
  throwIfError(error, "Could not move media.");
  const updated = await getMediaRows(client, unique, auth.profile.organizationId);
  return toRecords(client, updated);
}

export function mediaStorageBackend(): "r2" | "supabase" {
  return storageBackendName();
}
