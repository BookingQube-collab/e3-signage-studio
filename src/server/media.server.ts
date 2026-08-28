import {
  hasPermission,
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
import {
  assertBulkDeleteAllowed,
  liveUsagePlaylistIds,
  MAX_BULK_MEDIA_IDS,
} from "../lib/media-bulk";
import {
  assertUploadSize,
  buildStorageKey,
  hueFromChecksum,
  mediaTypeFromMime,
  normalizeChecksum,
  safeMediaFilename,
  uniqueLibraryFilename,
} from "../lib/media-file";
import { mediaKeysToSign } from "../lib/media-sign";
import { describeCanceledStatement } from "../lib/media-upload-error";
import {
  FOLDER_DUPLICATE_MESSAGE,
  assertFolderName,
  findFolderByName,
  resolveFolderCreate,
  uniqueFoldersByName,
} from "../lib/media-folders";
import {
  completeStatOutcome,
  incompleteVersionReusable,
  isVisibleLibraryStatus,
  shouldDiscardIncompleteMedia,
  shouldPromoteIncompleteObject,
  shouldPurgeAbandonedUpload,
} from "../lib/media-upload-lifecycle";
import { requireCmsPermission } from "./auth.server";
import type { MediaFolderRow, MediaRow, MediaVersionRow } from "./db/types";
import { getServerEnv } from "./env.server";
import {
  assertCanMutateOwnedContent,
  locationIdsForNewMedia,
  mediaVisibleToProfile,
} from "@/lib/location-scope";
import { loadScopedContentUsage } from "./scoped-content.server";
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
  "id, organization_id, name, type, mime_type, current_version_id, status, archived_at, folder_id, location_ids, created_at, updated_at, created_by, uploaded_by";
const FOLDER_SELECT_CORE = "id, organization_id, name, created_at, updated_at, created_by";
const FOLDER_SELECT = `${FOLDER_SELECT_CORE}, archived_at`;
const VERSION_SELECT =
  "id, media_id, version_number, storage_key, thumbnail_key, size_bytes, width, height, duration_ms, checksum_sha256, mime_type, status, created_at, created_by";

type UsedIn = MediaRecord["usedIn"];

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function isUnknownColumn(error: { message: string } | null, column: string): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    Boolean(error) &&
    msg.includes(column.toLowerCase()) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"))
  );
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

function asUuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
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
    location_ids: asUuidList(row["location_ids"]),
  };
}

function mapFolder(row: Record<string, unknown>): MediaFolderRow {
  return {
    id: asString(row["id"]),
    organization_id: asString(row["organization_id"]),
    name: asString(row["name"]),
    archived_at: asNullableString(row["archived_at"]),
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
      ? client.from("playlists").select("id, name, status, archived_at").in("id", playlistIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; name: string; status: string; archived_at: string | null }>,
        }),
    playlistIds.length > 0
      ? client
          .from("campaigns")
          .select("id, name, playlist_id")
          .in("playlist_id", playlistIds)
          .is("archived_at", null)
      : Promise.resolve({
          data: [] as Array<{ id: string; name: string; playlist_id: string }>,
        }),
    client.from("screens").select("name, currently_playing_media_id").in("currently_playing_media_id", mediaIds),
  ]);

  const livePlaylistIds = liveUsagePlaylistIds(
    (playlists ?? []).map((row) => ({
      id: asString((row as { id: string }).id),
      name: asString((row as { name: string }).name),
      status: asString((row as { status: string }).status),
      archived_at: asNullableString((row as { archived_at: string | null }).archived_at),
    })),
  );
  const playlistName = new Map<string, string>();
  for (const row of playlists ?? []) {
    const id = asString((row as { id: string }).id);
    if (!livePlaylistIds.has(id)) continue;
    playlistName.set(id, asString((row as { name: string }).name));
  }
  for (const row of itemRows ?? []) {
    const mediaId = asString((row as { media_id: string }).media_id);
    const name = playlistName.get(asString((row as { playlist_id: string }).playlist_id));
    const entry = map.get(mediaId);
    if (entry && name && !entry.playlists.includes(name)) entry.playlists.push(name);
  }
  for (const row of campaigns ?? []) {
    const playlistId = asString((row as { playlist_id: string }).playlist_id);
    if (!livePlaylistIds.has(playlistId)) continue;
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
  signAllPreviews = false,
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
    previewKeys.push(
      ...mediaKeysToSign({
        previewKey,
        isImage: Boolean(image),
        signAllPreviews,
      }),
    );
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
      previewUrl: signAllPreviews && previewKey ? (urls.get(previewKey) ?? null) : image ? (urls.get(image) ?? null) : null,
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
  const first = await client
    .from("media_folders")
    .select(FOLDER_SELECT)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (isUnknownColumn(first.error, "archived_at")) {
    const retry = await client
      .from("media_folders")
      .select(FOLDER_SELECT_CORE)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    throwIfError(retry.error, "Could not load folder.");
    return retry.data
      ? mapFolder({ ...(retry.data as Record<string, unknown>), archived_at: null })
      : null;
  }
  throwIfError(first.error, "Could not load folder.");
  return first.data ? mapFolder(first.data as Record<string, unknown>) : null;
}

async function loadAllFolderRows(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
): Promise<MediaFolderRow[]> {
  const first = await client
    .from("media_folders")
    .select(FOLDER_SELECT)
    .eq("organization_id", organizationId);
  if (isUnknownColumn(first.error, "archived_at")) {
    const retry = await client
      .from("media_folders")
      .select(FOLDER_SELECT_CORE)
      .eq("organization_id", organizationId);
    throwIfError(retry.error, "Could not load folders.");
    return (retry.data ?? []).map((row) =>
      mapFolder({ ...(row as Record<string, unknown>), archived_at: null }),
    );
  }
  throwIfError(first.error, "Could not load folders.");
  return (first.data ?? []).map((row) => mapFolder(row as Record<string, unknown>));
}

async function requireFolderId(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  if (!folderId) return null;
  const folder = await getFolderRow(client, folderId, organizationId);
  if (!folder || folder.archived_at) throw new Error("Folder not found.");
  return folder.id;
}

async function uniqueNameInFolder(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  folderId: string | null,
  filename: string,
  exceptMediaId?: string,
): Promise<string> {
  let query = client
    .from("media")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  query = folderId ? query.eq("folder_id", folderId) : query.is("folder_id", null);
  const { data, error } = await query;
  if (error) return safeMediaFilename(filename);
  const existing = (data ?? [])
    .filter((row) => asString((row as { id: string }).id) !== exceptMediaId)
    .map((row) => asString((row as { name: string }).name));
  return uniqueLibraryFilename(existing, filename);
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
    .eq("status", "READY");
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
    archivedAt: row.archived_at,
  };
}

export async function listMedia(accessToken: string): Promise<MediaRecord[]> {
  const auth = await requireCmsPermission(accessToken, "media.view");
  const client = getUserClient(accessToken);
  if (hasPermission(auth.profile.role, "media.manage")) {
    await reconcileAndPurgeAbandonedUploads(client, auth.profile.organizationId);
  }
  const { data, error } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("organization_id", auth.profile.organizationId)
    .is("archived_at", null)
    .eq("status", "READY")
    .order("created_at", { ascending: false });
  throwIfError(error, "Could not load media.");
  const usage = await loadScopedContentUsage(client, auth.profile);
  const rows = (data ?? [])
    .map((row) => mapMedia(row as Record<string, unknown>))
    .filter((row) =>
      mediaVisibleToProfile(
        auth.profile,
        { createdBy: row.created_by, uploadedBy: row.uploaded_by, locationIds: row.location_ids },
        usage.mediaIds.has(row.id),
      ),
    );
  return toRecords(client, rows);
}

export async function getMedia(accessToken: string, id: string): Promise<MediaRecord | null> {
  const auth = await requireCmsPermission(accessToken, "media.view");
  const client = getUserClient(accessToken);
  const row = await getMediaRow(client, id, auth.profile.organizationId);
  if (!row || row.archived_at || !isVisibleLibraryStatus(row.status)) return null;
  const usage = await loadScopedContentUsage(client, auth.profile);
  if (
    !mediaVisibleToProfile(
      auth.profile,
      { createdBy: row.created_by, uploadedBy: row.uploaded_by, locationIds: row.location_ids },
      usage.mediaIds.has(row.id),
    )
  ) {
    return null;
  }
  const records = await toRecords(client, [row], true);
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

async function findReusableIncompleteUpload(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  checksum: string,
  sizeBytes: number,
  mimeType: string,
): Promise<{ media: MediaRow; version: MediaVersionRow } | null> {
  const { data: mediaRaw, error: mediaError } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["PROCESSING", "FAILED"])
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  throwIfError(mediaError, "Could not look up pending uploads.");
  const mediaRows = (mediaRaw ?? []).map((row) => mapMedia(row as Record<string, unknown>));
  if (mediaRows.length === 0) return null;

  const { data: versionRaw, error: versionError } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .in(
      "media_id",
      mediaRows.map((row) => row.id),
    )
    .eq("checksum_sha256", checksum)
    .eq("size_bytes", sizeBytes)
    .in("status", ["PROCESSING", "FAILED"])
    .order("created_at", { ascending: false });
  throwIfError(versionError, "Could not look up pending upload versions.");

  const mediaById = new Map(mediaRows.map((row) => [row.id, row]));
  for (const raw of versionRaw ?? []) {
    const version = mapVersion(raw as Record<string, unknown>);
    const media = mediaById.get(version.media_id);
    if (!media) continue;
    if (media.current_version_id && media.current_version_id !== version.id) continue;
    if (
      !incompleteVersionReusable({
        checksum,
        sizeBytes,
        mimeType,
        versionChecksum: version.checksum_sha256,
        versionSizeBytes: version.size_bytes,
        versionMimeType: version.mime_type,
        versionStatus: version.status,
      })
    ) {
      continue;
    }
    return { media, version };
  }
  return null;
}

async function failOrDiscardUpload(
  client: ReturnType<typeof getUserClient>,
  media: MediaRow,
  version: MediaVersionRow,
): Promise<void> {
  if (
    shouldDiscardIncompleteMedia({
      mediaStatus: media.status,
      currentVersionId: media.current_version_id,
      failedVersionId: version.id,
    })
  ) {
    await purgeMediaRow(client, media.id);
    return;
  }
  await client.from("media_versions").update({ status: "FAILED" }).eq("id", version.id);
  const restoreReady = Boolean(media.current_version_id && media.current_version_id !== version.id);
  await client
    .from("media")
    .update({ status: restoreReady ? "READY" : "FAILED" })
    .eq("id", media.id);
}

async function markUploadReady(
  client: ReturnType<typeof getUserClient>,
  media: MediaRow,
  version: MediaVersionRow,
): Promise<void> {
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
}

function pickIncompleteVersion(versions: MediaVersionRow[], media: MediaRow): MediaVersionRow | null {
  const current = versions.find((version) => version.id === media.current_version_id);
  if (current && (current.status === "PROCESSING" || current.status === "FAILED")) return current;
  const incomplete = versions
    .filter((version) => version.status === "PROCESSING" || version.status === "FAILED")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return incomplete[0] ?? null;
}

async function reconcileAndPurgeAbandonedUploads(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
): Promise<void> {
  const { data, error } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["PROCESSING", "FAILED"])
    .is("archived_at", null)
    .limit(50);
  if (error || !data) return;
  const mediaRows = data.map((row) => mapMedia(row as Record<string, unknown>));
  if (mediaRows.length === 0) return;

  const { data: versionRaw, error: versionError } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .in(
      "media_id",
      mediaRows.map((row) => row.id),
    );
  if (versionError) return;
  const versionsByMedia = new Map<string, MediaVersionRow[]>();
  for (const raw of versionRaw ?? []) {
    const version = mapVersion(raw as Record<string, unknown>);
    const list = versionsByMedia.get(version.media_id) ?? [];
    list.push(version);
    versionsByMedia.set(version.media_id, list);
  }

  const nowMs = Date.now();
  const processingTtlMs = UPLOAD_URL_TTL_SECONDS * 1000;
  for (const media of mediaRows) {
    const version = pickIncompleteVersion(versionsByMedia.get(media.id) ?? [], media);
    if (!version) continue;
    try {
      const inspected = await inspectUploadedObject(version.storage_key, version.size_bytes);
      if (shouldPromoteIncompleteObject(inspected.outcome)) {
        await markUploadReady(client, media, version);
        continue;
      }
      if (inspected.outcome === "retry") continue;
      if (media.current_version_id && media.current_version_id !== version.id) continue;
      if (
        !shouldPurgeAbandonedUpload({
          status: media.status,
          createdAtIso: media.created_at,
          nowMs,
          processingTtlMs,
        })
      ) {
        continue;
      }
      await purgeMediaRow(client, media.id);
    } catch {
      // Listing must still succeed if one abandoned row cannot be completed or deleted.
    }
  }
}

export async function createUploadIntent(
  accessToken: string,
  input: UploadIntentInput,
): Promise<UploadIntentResult> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  assertUploadSize(input.mimeType, input.sizeBytes, serverUploadLimits());
  const checksum = normalizeChecksum(input.checksumSha256);
  const type = mediaTypeFromMime(input.mimeType);
  const orgId = auth.profile.organizationId;

  let mediaId = input.mediaId;
  let versionNumber = 1;

  if (mediaId) {
    const existing = await getMediaRow(client, mediaId, orgId);
    if (!existing) throw new Error("Media not found.");
    assertCanMutateOwnedContent(auth.profile, existing.created_by);
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
    const reusable = await findReusableIncompleteUpload(
      client,
      orgId,
      checksum,
      input.sizeBytes,
      input.mimeType,
    );
    if (reusable) {
      assertCanMutateOwnedContent(auth.profile, reusable.media.created_by);
      const folderId = await requireFolderId(client, orgId, input.folderId);
      const filename = await uniqueNameInFolder(
        client,
        orgId,
        folderId,
        input.filename,
        reusable.media.id,
      );
      const { error: reuseError } = await client
        .from("media")
        .update({
          name: filename,
          type,
          mime_type: input.mimeType,
          status: "PROCESSING",
          folder_id: folderId,
          uploaded_by: auth.userId,
        })
        .eq("id", reusable.media.id);
      throwIfError(reuseError, "Could not resume media upload.");
      const { error: versionReuseError } = await client
        .from("media_versions")
        .update({
          status: "PROCESSING",
          width: input.width,
          height: input.height,
          duration_ms: input.durationMs,
          mime_type: input.mimeType,
        })
        .eq("id", reusable.version.id);
      throwIfError(versionReuseError, "Could not resume media upload.");
      const signed = await createObjectUploadUrl(
        reusable.version.storage_key,
        input.mimeType,
        accessToken,
      );
      return {
        mediaId: reusable.media.id,
        mediaVersionId: reusable.version.id,
        versionNumber: reusable.version.version_number,
        storageKey: reusable.version.storage_key,
        uploadUrl: signed.url,
        uploadMethod: signed.method,
        uploadHeaders: signed.headers,
        expiresInSeconds: signed.expiresInSeconds || UPLOAD_URL_TTL_SECONDS,
      };
    }

    const folderId = await requireFolderId(client, orgId, input.folderId);
    const filename = await uniqueNameInFolder(client, orgId, folderId, input.filename);
    const { data, error } = await client
      .from("media")
      .insert({
        organization_id: orgId,
        name: filename,
        type,
        mime_type: input.mimeType,
        status: "PROCESSING",
        folder_id: folderId,
        location_ids: locationIdsForNewMedia(auth.profile),
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

async function inspectUploadedObject(
  key: string,
  expectedSizeBytes: number,
): Promise<{ outcome: ReturnType<typeof completeStatOutcome>; sizeBytes: number }> {
  let objectFound = false;
  let sizeBytes = -1;
  let statErrored = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const stat = await statObject(key);
      if (stat) {
        objectFound = true;
        sizeBytes = stat.sizeBytes;
        break;
      }
    } catch {
      statErrored = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return {
    outcome: completeStatOutcome({
      objectFound,
      sizeBytes,
      expectedSizeBytes,
      statErrored,
    }),
    sizeBytes,
  };
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
    const records = await toRecords(client, [media], true);
    const ready = records[0];
    if (!ready) throw new Error("Media not found.");
    return ready;
  }

  const inspected = await inspectUploadedObject(version.storage_key, version.size_bytes);
  if (inspected.outcome === "missing") {
    await failOrDiscardUpload(client, media, version);
    throw new Error("Upload did not reach storage. Try again.");
  }
  if (inspected.outcome === "retry") {
    throw new Error("Could not verify the uploaded file yet. Try that file again.");
  }

  await markUploadReady(client, media, version);

  const updated = await getMediaRow(client, media.id, auth.profile.organizationId);
  if (!updated) throw new Error("Media not found.");
  const records = await toRecords(client, [updated], true);
  const result = records[0];
  if (!result) throw new Error("Media not found.");
  return result;
}

export async function discardIncompleteUpload(
  accessToken: string,
  input: { mediaId: string; mediaVersionId: string },
): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const media = await getMediaRow(client, input.mediaId, auth.profile.organizationId);
  if (!media) return true;
  assertCanMutateOwnedContent(auth.profile, media.created_by);
  const { data: versionRaw, error } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .eq("id", input.mediaVersionId)
    .maybeSingle();
  throwIfError(error, "Could not load media version.");
  if (!versionRaw) return true;
  const version = mapVersion(versionRaw as Record<string, unknown>);
  if (version.media_id !== media.id) throw new Error("Upload session not found.");
  if (version.status === "READY" && media.current_version_id === version.id) {
    return true;
  }
  await failOrDiscardUpload(client, media, version);
  return true;
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
  assertCanMutateOwnedContent(auth.profile, existing.created_by);
  const { error } = await client
    .from("media")
    .update({ name: safeMediaFilename(filename) })
    .eq("id", id);
  throwIfError(error, "Could not rename media.");
  const updated = await getMediaRow(client, id, auth.profile.organizationId);
  if (!updated) throw new Error("Media not found.");
  const records = await toRecords(client, [updated], true);
  const result = records[0];
  if (!result) throw new Error("Media not found.");
  return result;
}

export async function archiveMedia(accessToken: string, id: string): Promise<MediaRecord> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const existing = await getMediaRow(client, id, auth.profile.organizationId);
  if (!existing) throw new Error("Media not found.");
  assertCanMutateOwnedContent(auth.profile, existing.created_by);
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
  assertCanMutateOwnedContent(auth.profile, existing.created_by);
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
  for (const row of rows) {
    assertCanMutateOwnedContent(auth.profile, row.created_by);
  }
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
  const usedIn = await loadUsedIn(client, ids);
  const blocked = rows
    .map((row) => ({
      filename: row.name,
      usedIn: usedIn.get(row.id) ?? { playlists: [], campaigns: [], screens: [] },
    }))
    .filter((item) => item.usedIn.playlists.length > 0);
  assertBulkDeleteAllowed(blocked);
}

async function detachNonLivePlaylistItems(
  client: ReturnType<typeof getUserClient>,
  mediaId: string,
): Promise<void> {
  const { data: itemRows, error } = await client
    .from("playlist_items")
    .select("id, playlist_id")
    .eq("media_id", mediaId);
  throwIfError(error, "Could not check media usage.");
  const playlistIds = [
    ...new Set((itemRows ?? []).map((row) => asString((row as { playlist_id: string }).playlist_id))),
  ].filter(Boolean);
  if (playlistIds.length === 0) return;

  const { data: playlists, error: playlistError } = await client
    .from("playlists")
    .select("id, status, archived_at")
    .in("id", playlistIds);
  throwIfError(playlistError, "Could not check playlist usage.");
  const liveIds = liveUsagePlaylistIds(
    (playlists ?? []).map((row) => ({
      id: asString((row as { id: string }).id),
      status: asString((row as { status: string }).status),
      archived_at: asNullableString((row as { archived_at: string | null }).archived_at),
    })),
  );
  const staleIds = (itemRows ?? [])
    .filter((row) => !liveIds.has(asString((row as { playlist_id: string }).playlist_id)))
    .map((row) => asString((row as { id: string }).id))
    .filter(Boolean);
  if (staleIds.length === 0) return;

  const { error: deleteError } = await client.from("playlist_items").delete().in("id", staleIds);
  throwIfError(deleteError, "Could not clear archived playlist usage.");
}

async function purgeMediaRow(client: ReturnType<typeof getUserClient>, id: string): Promise<void> {
  await detachNonLivePlaylistItems(client, id);
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
  if (hasPermission(auth.profile.role, "media.manage")) {
    await reconcileAndPurgeAbandonedUploads(client, orgId);
  }
  const first = await client
    .from("media_folders")
    .select(FOLDER_SELECT)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  let folders: MediaFolderRow[];
  if (isUnknownColumn(first.error, "archived_at")) {
    const retry = await client
      .from("media_folders")
      .select(FOLDER_SELECT_CORE)
      .eq("organization_id", orgId)
      .order("name", { ascending: true });
    throwIfError(retry.error, "Could not load folders.");
    folders = (retry.data ?? []).map((row) =>
      mapFolder({ ...(row as Record<string, unknown>), archived_at: null }),
    );
  } else {
    throwIfError(first.error, "Could not load folders.");
    folders = (first.data ?? []).map((row) => mapFolder(row as Record<string, unknown>));
  }
  folders = folders.filter((folder) => !folder.archived_at);
  if (folders.length === 0) return [];

  const { data: mediaRows, error: countError } = await client
    .from("media")
    .select("folder_id")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .eq("status", "READY")
    .not("folder_id", "is", null);
  throwIfError(countError, "Could not count folder files.");
  const counts = new Map<string, number>();
  for (const row of mediaRows ?? []) {
    const folderId = asNullableString((row as { folder_id: string | null }).folder_id);
    if (!folderId) continue;
    counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
  }
  return uniqueFoldersByName(
    folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      createdAt: dateLabel(folder.created_at),
      fileCount: counts.get(folder.id) ?? 0,
      archivedAt: folder.archived_at,
    })),
  );
}

export async function createFolder(accessToken: string, name: string): Promise<MediaFolderRecord> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const orgId = auth.profile.organizationId;
  const normalized = assertFolderName(name);
  const rows = await loadAllFolderRows(client, orgId);
  const resolved = resolveFolderCreate(
    rows.map((row) => ({ id: row.id, name: row.name, archivedAt: row.archived_at })),
    normalized,
    "",
  );
  if (resolved.reused) {
    const match = rows.find((row) => row.id === resolved.folder.id && !row.archived_at);
    if (match) return toFolderRecord(client, match);
  }
  const { data, error } = await client
    .from("media_folders")
    .insert({
      organization_id: orgId,
      name: normalized,
      created_by: auth.userId,
    })
    .select(FOLDER_SELECT_CORE)
    .single();
  if (error?.code === "23505") {
    const racedRows = await loadAllFolderRows(client, orgId);
    const match = findFolderByName(
      racedRows.filter((row) => !row.archived_at),
      normalized,
    );
    if (match) return toFolderRecord(client, match);
    throw new Error(FOLDER_DUPLICATE_MESSAGE);
  }
  throwIfError(error, "Could not create folder.");
  return toFolderRecord(client, mapFolder({ ...(data as Record<string, unknown>), archived_at: null }));
}

async function mediaRowsInFolder(
  client: ReturnType<typeof getUserClient>,
  folderId: string,
  organizationId: string,
): Promise<MediaRow[]> {
  const { data, error } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("folder_id", folderId)
    .eq("organization_id", organizationId);
  throwIfError(error, "Could not load folder files.");
  return (data ?? []).map((row) => mapMedia(row as Record<string, unknown>));
}

export async function deleteFolder(accessToken: string, id: string): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const orgId = auth.profile.organizationId;
  const existing = await getFolderRow(client, id, orgId);
  if (!existing) throw new Error("Folder not found.");
  if (existing.archived_at) return true;

  const rows = await mediaRowsInFolder(client, id, orgId);
  for (const row of rows) {
    assertCanMutateOwnedContent(auth.profile, row.created_by);
  }
  const visible = rows.filter((row) => !row.archived_at && isVisibleLibraryStatus(row.status));
  await assertIdsDeletable(client, visible);

  const now = new Date().toISOString();
  if (visible.length > 0) {
    const { error: archiveMediaError } = await client
      .from("media")
      .update({ status: "ARCHIVED", archived_at: now })
      .in(
        "id",
        visible.map((row) => row.id),
      )
      .eq("organization_id", orgId);
    throwIfError(archiveMediaError, "Could not delete folder files.");
  }

  let folderGoneFromLibrary = false;
  const { error: archiveError } = await client
    .from("media_folders")
    .update({ archived_at: now })
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("archived_at", null);
  if (isUnknownColumn(archiveError, "archived_at")) {
    const { error: deleteError } = await client.from("media_folders").delete().eq("id", id);
    throwIfError(deleteError, "Could not delete folder.");
    folderGoneFromLibrary = true;
  } else {
    throwIfError(archiveError, "Could not delete folder.");
    folderGoneFromLibrary = true;
  }

  try {
    for (const row of rows) {
      await purgeMediaRow(client, row.id);
    }
    await client.from("media_folders").delete().eq("id", id);
  } catch (error) {
    if (folderGoneFromLibrary) return true;
    const raw = error instanceof Error ? error.message : "";
    throw new Error(
      describeCanceledStatement(
        raw,
        "Could not finish deleting this folder. It is still in the library. Try again, or remove files from live playlists first.",
      ),
    );
  }

  if (folderGoneFromLibrary) return true;
  const leftover = await getFolderRow(client, id, orgId);
  if (leftover && !leftover.archived_at) {
    throw new Error("Could not delete folder.");
  }
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
  for (const row of existing) {
    assertCanMutateOwnedContent(auth.profile, row.created_by);
  }
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
