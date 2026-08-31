import {
  hasPermission,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  type MediaStatus,
  type MediaType,
} from "@e3/shared-types";
import type { AllowedMediaMime } from "@e3/validation";
import {
  MAX_AUDIO_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  parseUploadByteLimit,
  isAllowedMediaMime,
} from "@e3/validation";

import type { MediaFolderRecord, MediaRecord } from "@/services/media-map";
import {
  blockingLivePlaylistIds,
  MAX_BULK_MEDIA_IDS,
  shouldDeleteFromStorage,
} from "../lib/media-bulk";
import {
  assertUploadSize,
  buildStorageKey,
  hueFromChecksum,
  inferOrphanMediaMime,
  mediaTypeFromMime,
  normalizeChecksum,
  renameMediaDisplayName,
  ensurePlayableFilename,
  safeMediaFilename,
  uniqueLibraryFilename,
} from "../lib/media-file";
import { mediaKeysToSign } from "../lib/media-sign";
import { describeCanceledStatement, describeResyncError, isCanceledStatementError, RESYNC_TIMEOUT_MESSAGE } from "../lib/media-upload-error";
import {
  FOLDER_DUPLICATE_MESSAGE,
  assertFolderName,
  findFolderByName,
  resolveFolderCreate,
  uniqueFoldersByName,
} from "../lib/media-folders";
import {
  AUTO_SYNC_DEADLINE_MS,
  AUTO_SYNC_R2_MAX_PAGES,
  chunkItems,
  incompleteVersionReusable,
  isVisibleLibraryStatus,
  RESYNC_KEY_IN_CHUNK,
  RESYNC_MANUAL_DEADLINE_MS,
  RESYNC_R2_MAX_PAGES,
  RESYNC_R2_PAGE_SIZE,
  RESYNC_UPDATE_BATCH_SIZE,
  orphanStorageKeysOnPage,
  shouldDiscardIncompleteMedia,
  shouldResyncPromote,
  shouldResyncRestoreLibraryRow,
  shouldSkipCompleteObjectStat,
  shouldSkipLibraryAutoSync,
  shouldSkipManualStorageResync,
  shouldListBucketBeforeHeadPromote,
  STORAGE_LIST_TIMEOUT_MS,
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
  listStoredObjectKeysPage,
  statObject,
  storageBackendName,
  UPLOAD_URL_TTL_SECONDS,
} from "./storage.server";
import { getServiceRoleClient, getUserClient } from "./supabase.server";

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

function serverUploadLimits(): { imageBytes: number; videoBytes: number; audioBytes: number } {
  const env = getServerEnv();
  return {
    imageBytes: parseUploadByteLimit(env.mediaMaxImageBytes, MAX_IMAGE_UPLOAD_BYTES),
    videoBytes: parseUploadByteLimit(env.mediaMaxVideoBytes, MAX_VIDEO_UPLOAD_BYTES),
    audioBytes: MAX_AUDIO_UPLOAD_BYTES,
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

  const [{ data: itemRows }, { data: audioRows }] = await Promise.all([
    client.from("playlist_items").select("media_id, playlist_id").in("media_id", mediaIds),
    client
      .from("playlist_items")
      .select("audio_media_id, playlist_id")
      .in("audio_media_id", mediaIds),
  ]);
  const playlistIds = [
    ...new Set(
      [...(itemRows ?? []), ...(audioRows ?? [])].map((row) =>
        asString((row as { playlist_id: string }).playlist_id),
      ),
    ),
  ].filter(Boolean);

  const [{ data: playlists }, { data: campaigns }, { data: playingScreens }, { data: assignedScreens }] =
    await Promise.all([
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
      client
        .from("screens")
        .select("name, currently_playing_media_id")
        .in("currently_playing_media_id", mediaIds),
      playlistIds.length > 0
        ? client
            .from("screens")
            .select("current_playlist_id")
            .in("current_playlist_id", playlistIds)
            .is("archived_at", null)
        : Promise.resolve({ data: [] as Array<{ current_playlist_id: string }> }),
    ]);

  const linkedPlaylistIds = new Set<string>();
  for (const row of campaigns ?? []) {
    const id = asString((row as { playlist_id: string }).playlist_id);
    if (id) linkedPlaylistIds.add(id);
  }
  for (const row of assignedScreens ?? []) {
    const id = asString((row as { current_playlist_id: string }).current_playlist_id);
    if (id) linkedPlaylistIds.add(id);
  }

  const livePlaylistIds = blockingLivePlaylistIds(
    (playlists ?? []).map((row) => ({
      id: asString((row as { id: string }).id),
      name: asString((row as { name: string }).name),
      status: asString((row as { status: string }).status),
      archived_at: asNullableString((row as { archived_at: string | null }).archived_at),
    })),
    linkedPlaylistIds,
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
  for (const row of playingScreens ?? []) {
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
    const thumbnailKey =
      current && current.status === "READY" ? (current.thumbnail_key ?? image) : image;
    previewKeys.push(
      ...mediaKeysToSign({
        previewKey,
        thumbnailKey,
        isImage: Boolean(image),
        signAllPreviews,
      }),
    );
    return { row, current, image, previewKey, thumbnailKey };
  });

  const urls = await createObjectDownloadUrls(previewKeys);

  return picked.map(({ row, current, image, previewKey, thumbnailKey }) => {
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
      thumbnailUrl: thumbnailKey ? (urls.get(thumbnailKey) ?? null) : null,
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
  // Do not block the library response on R2 reconcile (up to ~2.5s).
  if (hasPermission(auth.profile.role, "media.manage")) {
    void reconcilePendingUploadsOnce(client, auth.profile.organizationId);
  }
  const [{ data, error }, usage] = await Promise.all([
    client
      .from("media")
      .select(MEDIA_SELECT)
      .eq("organization_id", auth.profile.organizationId)
      .is("archived_at", null)
      .eq("status", "READY")
      .order("created_at", { ascending: false }),
    loadScopedContentUsage(client, auth.profile),
  ]);
  throwIfError(error, "Could not load media.");
  const rows = (data ?? [])
    .map((row) => mapMedia(row as Record<string, unknown>))
    .filter((row) =>
      mediaVisibleToProfile(
        auth.profile,
        { createdBy: row.created_by, uploadedBy: row.uploaded_by, locationIds: row.location_ids },
        usage.mediaIds.has(row.id),
      ),
    );
  // List path: image thumbs only. Videos are signed on getMedia / playlist.get.
  return toRecords(client, rows, false);
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
    await purgeMediaRow(client, media.id, { deleteFromStorage: true });
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

function mimeForRestoredRow(mimeType: string, filename: string, key: string): AllowedMediaMime | null {
  if (isAllowedMediaMime(mimeType)) return mimeType;
  return inferOrphanMediaMime(key, mimeType) ?? inferOrphanMediaMime(filename, mimeType);
}

async function applyRestoredLibraryMetadata(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  media: MediaRow,
  mime: AllowedMediaMime,
): Promise<MediaRow> {
  const type = mediaTypeFromMime(mime);
  const filename = await uniqueNameInFolder(
    client,
    organizationId,
    media.folder_id,
    ensurePlayableFilename(media.name, mime),
    media.id,
  );
  if (filename === media.name && type === media.type && mime === media.mime_type) {
    return { ...media, status: "READY", archived_at: null, mime_type: mime, type };
  }
  const { error } = await client
    .from("media")
    .update({ name: filename, type, mime_type: mime })
    .eq("id", media.id);
  throwIfError(error, "Could not restore media.");
  return {
    ...media,
    name: filename,
    type,
    mime_type: mime,
    status: "READY",
    archived_at: null,
  };
}

function pickIncompleteVersion(versions: MediaVersionRow[], media: MediaRow): MediaVersionRow | null {
  const current = versions.find((version) => version.id === media.current_version_id);
  if (current && (current.status === "PROCESSING" || current.status === "FAILED")) return current;
  const incomplete = versions
    .filter((version) => version.status === "PROCESSING" || version.status === "FAILED")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return incomplete[0] ?? null;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function toCompletedRecord(
  client: ReturnType<typeof getUserClient>,
  media: MediaRow,
  version: MediaVersionRow,
): Promise<MediaRecord> {
  const type = isMediaType(media.type) ? media.type : "IMAGE";
  const isImage = version.mime_type.startsWith("image/");
  const previewKey = version.storage_key || null;
  const thumbnailKey = version.thumbnail_key || (isImage ? previewKey : null);
  const keys = mediaKeysToSign({ previewKey, thumbnailKey, isImage, signAllPreviews: true });
  const [urls, folderRow] = await Promise.all([
    createObjectDownloadUrls(keys),
    media.folder_id
      ? client.from("media_folders").select("name").eq("id", media.folder_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const checksum = version.checksum_sha256 || media.id.replace(/-/g, "").slice(0, 64);
  const sizeBytes = version.size_bytes ?? 0;
  return {
    id: media.id,
    filename: media.name,
    type,
    mimeType: media.mime_type || version.mime_type,
    status: "READY",
    dimensions: dimensionsOf(version),
    durationSec: version.duration_ms ? Math.round(version.duration_ms / 1000) : null,
    sizeMb: Number((sizeBytes / 1_000_000).toFixed(1)),
    modifiedAt: dateLabel(media.updated_at || media.created_at),
    uploadedBy: "Team member",
    uploadedAt: dateLabel(media.created_at),
    version: `v${version.version_number || 1}`,
    thumbnailHue: hueFromChecksum(checksum),
    thumbnailUrl: thumbnailKey ? (urls.get(thumbnailKey) ?? null) : null,
    previewUrl: previewKey ? (urls.get(previewKey) ?? null) : null,
    folderId: media.folder_id,
    folderName: media.folder_id ? asNullableString((folderRow.data as { name?: string } | null)?.name) : null,
    usedIn: { playlists: [], campaigns: [], screens: [] },
  };
}

async function loadIncompleteMediaWithVersions(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  folderId?: string | null,
  limit = 80,
): Promise<Array<{ media: MediaRow; version: MediaVersionRow }>> {
  let query = client
    .from("media")
    .select(MEDIA_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["PROCESSING", "FAILED"])
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (folderId) query = query.eq("folder_id", folderId);
  const { data, error } = await query;
  throwIfError(error, "Could not load pending uploads.");
  if (!data || data.length === 0) return [];
  const mediaRows = data.map((row) => mapMedia(row as Record<string, unknown>));
  const { data: versionRaw, error: versionError } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .in(
      "media_id",
      mediaRows.map((row) => row.id),
    )
    .in("status", ["PROCESSING", "FAILED"]);
  throwIfError(versionError, "Could not load pending upload versions.");
  const versionsByMedia = new Map<string, MediaVersionRow[]>();
  for (const raw of versionRaw ?? []) {
    const version = mapVersion(raw as Record<string, unknown>);
    const list = versionsByMedia.get(version.media_id) ?? [];
    list.push(version);
    versionsByMedia.set(version.media_id, list);
  }
  const pending: Array<{ media: MediaRow; version: MediaVersionRow }> = [];
  for (const media of mediaRows) {
    const version = pickIncompleteVersion(versionsByMedia.get(media.id) ?? [], media);
    if (version) pending.push({ media, version });
  }
  return pending;
}

async function hasIncompleteUploads(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  folderId?: string | null,
): Promise<boolean> {
  let query = client
    .from("media")
    .select("id")
    .eq("organization_id", organizationId)
    .in("status", ["PROCESSING", "FAILED"])
    .is("archived_at", null)
    .limit(1);
  if (folderId) query = query.eq("folder_id", folderId);
  const { data, error } = await query;
  throwIfError(error, "Could not check pending uploads.");
  return (data?.length ?? 0) > 0;
}

async function loadPendingMatchingStorageKeys(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  storageKeys: string[],
  folderId?: string | null,
): Promise<Array<{ media: MediaRow; version: MediaVersionRow }>> {
  const uniqueKeys = [...new Set(storageKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) return [];
  const { data: versionRaw, error: versionError } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .in("storage_key", uniqueKeys)
    .in("status", ["PROCESSING", "FAILED"]);
  throwIfError(versionError, "Could not match pending uploads.");
  const versions = (versionRaw ?? []).map((row) => mapVersion(row as Record<string, unknown>));
  const mediaIds = [...new Set(versions.map((version) => version.media_id))];
  if (mediaIds.length === 0) return [];

  let mediaQuery = client
    .from("media")
    .select(MEDIA_SELECT)
    .in("id", mediaIds)
    .eq("organization_id", organizationId)
    .in("status", ["PROCESSING", "FAILED"])
    .is("archived_at", null);
  if (folderId) mediaQuery = mediaQuery.eq("folder_id", folderId);
  const { data, error } = await mediaQuery;
  throwIfError(error, "Could not load pending media.");
  const mediaById = new Map(
    (data ?? []).map((row) => {
      const media = mapMedia(row as Record<string, unknown>);
      return [media.id, media] as const;
    }),
  );
  const pending: Array<{ media: MediaRow; version: MediaVersionRow }> = [];
  for (const version of versions) {
    const media = mediaById.get(version.media_id);
    if (!media) continue;
    if (!shouldResyncPromote(media.status, true)) continue;
    pending.push({ media, version });
  }
  return pending;
}

async function promoteRowsInBatches(
  client: ReturnType<typeof getUserClient>,
  rows: Array<{ media: MediaRow; version: MediaVersionRow }>,
): Promise<MediaRow[]> {
  const promoted: MediaRow[] = [];
  for (const batch of chunkItems(rows, RESYNC_UPDATE_BATCH_SIZE)) {
    const done = await Promise.all(
      batch.map(async ({ media, version }) => {
        try {
          await markUploadReady(client, media, version);
          const mime = mimeForRestoredRow(version.mime_type, media.name, version.storage_key);
          if (mime) {
            return applyRestoredLibraryMetadata(client, media.organization_id, {
              ...media,
              status: "READY",
              current_version_id: version.id,
              mime_type: mime,
            }, mime);
          }
          return {
            ...media,
            status: "READY",
            current_version_id: version.id,
            mime_type: version.mime_type,
          };
        } catch (error) {
          if (isCanceledStatementError(error instanceof Error ? error.message : "")) throw error;
          return null;
        }
      }),
    );
    for (const row of done) {
      if (row) promoted.push(row);
    }
  }
  return promoted;
}

async function loadReferencedStorageKeys(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  storageKeys: string[],
): Promise<Set<string>> {
  const uniqueKeys = [...new Set(storageKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) return new Set();
  const keySet = new Set(uniqueKeys);
  const [{ data: byStorage, error: storageError }, { data: byThumb, error: thumbError }] =
    await Promise.all([
      client
        .from("media_versions")
        .select("storage_key, thumbnail_key, media_id")
        .in("storage_key", uniqueKeys),
      client
        .from("media_versions")
        .select("storage_key, thumbnail_key, media_id")
        .in("thumbnail_key", uniqueKeys),
    ]);
  throwIfError(storageError, "Could not match stored files.");
  throwIfError(thumbError, "Could not match stored thumbnails.");
  const versions = [...(byStorage ?? []), ...(byThumb ?? [])].map((row) => ({
    storage_key: asString((row as { storage_key: string }).storage_key),
    thumbnail_key: asNullableString((row as { thumbnail_key: string | null }).thumbnail_key),
    media_id: asString((row as { media_id: string }).media_id),
  }));
  if (versions.length === 0) return new Set();
  const { data: mediaRaw, error: mediaError } = await client
    .from("media")
    .select("id")
    .in("id", [...new Set(versions.map((row) => row.media_id))])
    .eq("organization_id", organizationId);
  throwIfError(mediaError, "Could not match stored media.");
  const orgMediaIds = new Set((mediaRaw ?? []).map((row) => asString((row as { id: string }).id)));
  const referenced = new Set<string>();
  for (const version of versions) {
    if (!orgMediaIds.has(version.media_id)) continue;
    if (version.storage_key && keySet.has(version.storage_key)) referenced.add(version.storage_key);
    if (version.thumbnail_key && keySet.has(version.thumbnail_key)) {
      referenced.add(version.thumbnail_key);
    }
  }
  return referenced;
}

async function restoreLibraryRowsForKeys(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  storageKeys: string[],
): Promise<MediaRow[]> {
  const uniqueKeys = [...new Set(storageKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) return [];
  const { data: versionRaw, error } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .in("storage_key", uniqueKeys);
  throwIfError(error, "Could not match stored versions.");
  const versions = (versionRaw ?? []).map((row) => mapVersion(row as Record<string, unknown>));
  const mediaIds = [...new Set(versions.map((version) => version.media_id))];
  if (mediaIds.length === 0) return [];
  const { data, error: mediaError } = await client
    .from("media")
    .select(MEDIA_SELECT)
    .in("id", mediaIds)
    .eq("organization_id", organizationId);
  throwIfError(mediaError, "Could not load stored media.");
  const mediaById = new Map(
    (data ?? []).map((row) => {
      const media = mapMedia(row as Record<string, unknown>);
      return [media.id, media] as const;
    }),
  );
  const restorable: Array<{ media: MediaRow; version: MediaVersionRow }> = [];
  for (const version of versions) {
    const media = mediaById.get(version.media_id);
    if (!media) continue;
    if (!shouldResyncRestoreLibraryRow(media.status, media.archived_at, true)) continue;
    restorable.push({ media, version });
  }
  const restored: MediaRow[] = [];
  for (const batch of chunkItems(restorable, RESYNC_UPDATE_BATCH_SIZE)) {
    const done = await Promise.all(
      batch.map(async ({ media, version }) => {
        try {
          await markUploadReady(client, media, version);
          if (media.archived_at) {
            const { error: clearArchive } = await client
              .from("media")
              .update({ archived_at: null })
              .eq("id", media.id);
            throwIfError(clearArchive, "Could not restore media.");
          }
          const mime = mimeForRestoredRow(version.mime_type, media.name, version.storage_key);
          if (mime) {
            return applyRestoredLibraryMetadata(client, organizationId, {
              ...media,
              status: "READY",
              archived_at: null,
              current_version_id: version.id,
              mime_type: mime,
            }, mime);
          }
          return {
            ...media,
            status: "READY",
            archived_at: null,
            current_version_id: version.id,
            mime_type: version.mime_type,
          };
        } catch (error) {
          if (isCanceledStatementError(error instanceof Error ? error.message : "")) throw error;
          return null;
        }
      }),
    );
    for (const row of done) {
      if (row) restored.push(row);
    }
  }
  return restored;
}

type PromoteFromR2Options = {
  folderId?: string | null;
  maxPages: number;
  deadlineMs: number;
  importOrphans?: boolean;
  createdBy?: string;
  locationIds?: string[];
};

async function promotePendingFromR2Pages(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
  options: PromoteFromR2Options,
): Promise<{ promoted: MediaRow[]; purgedCount: number }> {
  const importOrphans = Boolean(options.importOrphans);
  if (!importOrphans) {
    if (shouldSkipLibraryAutoSync(await hasIncompleteUploads(client, organizationId, options.folderId))) {
      return { promoted: [], purgedCount: 0 };
    }
  } else if (shouldSkipManualStorageResync()) {
    return { promoted: [], purgedCount: 0 };
  }

  const promoted: MediaRow[] = [];
  let purgedCount = 0;
  const seen = new Set<string>();
  const listBeforeHead = shouldListBucketBeforeHeadPromote(importOrphans);

  function take(rows: MediaRow[]): MediaRow[] {
    const fresh: MediaRow[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      fresh.push(row);
    }
    return fresh;
  }

  async function promoteKnownIncomplete(folderId?: string | null, limit?: number): Promise<void> {
    const pending = await loadIncompleteMediaWithVersions(client, organizationId, folderId, limit);
    for (const batch of chunkItems(pending, RESYNC_UPDATE_BATCH_SIZE)) {
      const remainingMs = options.deadlineMs - Date.now();
      if (remainingMs < 400) break;
      const found: Array<{ media: MediaRow; version: MediaVersionRow }> = [];
      await Promise.all(
        batch.map(async (row) => {
          if (seen.has(row.media.id)) return;
          try {
            const stat = await statObject(row.version.storage_key);
            if (stat) found.push(row);
          } catch {
            // HEAD can flake; ListBucket orphan scan still has a chance later.
          }
        }),
      );
      if (found.length === 0) continue;
      promoted.push(...take(await promoteRowsInBatches(client, found)));
    }
  }

  async function scanBucketPages(): Promise<boolean> {
    let token: string | null = null;
    let timedOut = false;
    for (let page = 0; page < options.maxPages; page += 1) {
      const remainingMs = options.deadlineMs - Date.now();
      if (remainingMs < 400) {
        timedOut = true;
        break;
      }
      let listed: { keys: string[]; nextContinuationToken: string | null } | null;
      try {
        listed = await listStoredObjectKeysPage(`${organizationId}/`, {
          maxKeys: RESYNC_R2_PAGE_SIZE,
          continuationToken: token,
          timeoutMs: Math.min(STORAGE_LIST_TIMEOUT_MS, remainingMs),
          throwOnError: importOrphans,
        });
      } catch {
        timedOut = true;
        break;
      }
      if (!listed || listed.keys.length === 0) break;

      for (const keyChunk of chunkItems(listed.keys, RESYNC_KEY_IN_CHUNK)) {
        if (options.deadlineMs - Date.now() < 400) {
          timedOut = true;
          break;
        }
        const matches = await loadPendingMatchingStorageKeys(
          client,
          organizationId,
          keyChunk,
          importOrphans ? undefined : options.folderId,
        );
        if (matches.length > 0) {
          promoted.push(...take(await promoteRowsInBatches(client, matches)));
        }
        if (!importOrphans) continue;
        // Restore archived / non-READY rows that still have DB records.
        const restored = await restoreLibraryRowsForKeys(client, organizationId, keyChunk);
        if (restored.length > 0) promoted.push(...take(restored));
        // Never recreate library rows for deleted media. Purge true R2 orphans instead.
        const referenced = await loadReferencedStorageKeys(client, organizationId, keyChunk);
        const orphans = orphanStorageKeysOnPage(keyChunk, referenced);
        if (orphans.length === 0) continue;
        try {
          await deleteObjects(orphans);
          purgedCount += orphans.length;
        } catch {
          // Best-effort cleanup; next Sync can retry leftovers.
        }
      }

      if (timedOut) break;
      if (!listed.nextContinuationToken) break;
      token = listed.nextContinuationToken;
    }
    return timedOut;
  }

  // Manual Sync: list R2 first so PROCESSING videos are promoted from keys on the
  // page. HEAD-before-list used to burn the deadline and leave renamed videos hidden.
  let timedOut = false;
  if (listBeforeHead) {
    timedOut = await scanBucketPages();
    if (options.deadlineMs - Date.now() >= 400) {
      await promoteKnownIncomplete(undefined, 40);
    }
  } else {
    await promoteKnownIncomplete(options.folderId, 20);
    if (options.deadlineMs - Date.now() >= 400 && promoted.length === 0) {
      timedOut = await scanBucketPages();
    }
  }

  if (timedOut && promoted.length === 0 && purgedCount === 0) {
    throw new Error(RESYNC_TIMEOUT_MESSAGE);
  }
  return { promoted, purgedCount };
}

const reconcileInFlight = new Map<string, Promise<void>>();

async function reconcilePendingUploadsOnce(
  client: ReturnType<typeof getUserClient>,
  organizationId: string,
): Promise<void> {
  const existing = reconcileInFlight.get(organizationId);
  if (existing) return existing;
  const run = withDeadline(
    promotePendingFromR2Pages(client, organizationId, {
      maxPages: AUTO_SYNC_R2_MAX_PAGES,
      deadlineMs: Date.now() + AUTO_SYNC_DEADLINE_MS,
    }),
    AUTO_SYNC_DEADLINE_MS,
  )
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      reconcileInFlight.delete(organizationId);
    });
  reconcileInFlight.set(organizationId, run);
  return run;
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
    return toCompletedRecord(client, media, version);
  }

  // Client PUT already succeeded. HEAD to R2 was hanging the library at 100%.
  if (shouldSkipCompleteObjectStat(true)) {
    await markUploadReady(client, media, version);
    return toCompletedRecord(
      client,
      {
        ...media,
        status: "READY",
        current_version_id: version.id,
        mime_type: version.mime_type,
      },
      { ...version, status: "READY" },
    );
  }

  throw new Error("Upload did not reach storage. Try again.");
}

export async function resyncFromStorage(
  accessToken: string,
  folderId: string | null,
): Promise<{ media: MediaRecord[]; purgedCount: number }> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  try {
    const { promoted, purgedCount } = await promotePendingFromR2Pages(
      client,
      auth.profile.organizationId,
      {
        folderId,
        maxPages: RESYNC_R2_MAX_PAGES,
        deadlineMs: Date.now() + RESYNC_MANUAL_DEADLINE_MS,
        importOrphans: true,
        createdBy: auth.userId,
        locationIds: locationIdsForNewMedia(auth.profile),
      },
    );
    if (promoted.length === 0) return { media: [], purgedCount };
    return { media: await toRecords(client, promoted, true), purgedCount };
  } catch (error) {
    throw new Error(describeResyncError(error instanceof Error ? error.message : ""));
  }
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
  const nextName = renameMediaDisplayName(existing.name, filename);
  if (nextName !== existing.name) {
    const { data, error } = await client
      .from("media")
      .update({ name: nextName })
      .eq("id", id)
      .eq("organization_id", auth.profile.organizationId)
      .select(MEDIA_SELECT)
      .maybeSingle();
    if (error?.code === "23505") {
      const unique = await uniqueNameInFolder(
        client,
        auth.profile.organizationId,
        existing.folder_id,
        nextName,
        existing.id,
      );
      const retry = await client
        .from("media")
        .update({ name: unique })
        .eq("id", id)
        .eq("organization_id", auth.profile.organizationId)
        .select(MEDIA_SELECT)
        .maybeSingle();
      throwIfError(retry.error, "Could not rename media.");
      if (!retry.data) throw new Error("Could not rename media.");
    } else {
      throwIfError(error, "Could not rename media.");
      if (!data) throw new Error("Could not rename media.");
    }
  }

  let updated = await getMediaRow(client, id, auth.profile.organizationId);
  if (!updated) throw new Error("Media not found.");
  if (updated.current_version_id && (updated.status !== "READY" || updated.archived_at)) {
    const { data: versionRaw, error: versionError } = await client
      .from("media_versions")
      .select("status")
      .eq("id", updated.current_version_id)
      .maybeSingle();
    throwIfError(versionError, "Could not load media version.");
    if (asString((versionRaw as { status?: string } | null)?.status) === "READY") {
      const { error: restoreError } = await client
        .from("media")
        .update({ status: "READY", archived_at: null })
        .eq("id", id)
        .eq("organization_id", auth.profile.organizationId);
      throwIfError(restoreError, "Could not rename media.");
      updated = (await getMediaRow(client, id, auth.profile.organizationId)) ?? {
        ...updated,
        status: "READY",
        archived_at: null,
      };
    }
  }

  try {
    const records = await toRecords(client, [updated], true);
    const result = records[0];
    if (result) return result;
  } catch {
    // Preview signing must not make a successful rename look like a delete.
  }
  if (!updated.current_version_id) {
    throw new Error("Media not found.");
  }
  const { data: versionRaw, error: versionError } = await client
    .from("media_versions")
    .select(VERSION_SELECT)
    .eq("id", updated.current_version_id)
    .maybeSingle();
  throwIfError(versionError, "Could not load media version.");
  if (!versionRaw) throw new Error("Media not found.");
  return toCompletedRecord(client, { ...updated, status: "READY" }, mapVersion(versionRaw as Record<string, unknown>));
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

export async function deleteMedia(
  accessToken: string,
  id: string,
  _options: { deleteFromStorage?: boolean } = {},
): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const existing = await getMediaRow(client, id, auth.profile.organizationId);
  if (!existing) throw new Error("Media not found.");
  assertCanMutateOwnedContent(auth.profile, existing.created_by);
  // Always hard-delete Cloudflare/R2 objects with the library row.
  await purgeMediaRow(client, id, { deleteFromStorage: true, accessToken });
  return true;
}

export async function deleteMediaBulk(
  accessToken: string,
  ids: string[],
  _options: { deleteFromStorage?: boolean } = {},
): Promise<boolean> {
  const auth = await requireCmsPermission(accessToken, "media.manage");
  const client = getUserClient(accessToken);
  const unique = uniqueMediaIds(ids);
  if (unique.length === 0) return true;
  const rows = await getMediaRows(client, unique, auth.profile.organizationId);
  if (rows.length !== unique.length) throw new Error("Some files were not found.");
  for (const row of rows) {
    assertCanMutateOwnedContent(auth.profile, row.created_by);
  }
  for (const row of rows) {
    await purgeMediaRow(client, row.id, { deleteFromStorage: true, accessToken });
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

/**
 * Strip playlist / layout / published-package references so media_versions can
 * be hard-deleted. Prefer delete over block: product wants library delete to win.
 */
async function detachMediaDependents(
  client: ReturnType<typeof getUserClient>,
  admin: ReturnType<typeof getServiceRoleClient>,
  mediaId: string,
  mediaName: string,
): Promise<{ screenIds: string[]; playlistIds: string[] }> {
  const screenIds = new Set<string>();

  const { data: itemRows, error: itemError } = await client
    .from("playlist_items")
    .select("id, playlist_id, media_id, audio_media_id")
    .or(`media_id.eq.${mediaId},audio_media_id.eq.${mediaId}`);
  throwIfError(itemError, "Could not check media usage.");

  const playlistIds = [
    ...new Set((itemRows ?? []).map((row) => asString((row as { playlist_id: string }).playlist_id))),
  ].filter(Boolean);

  const visualIds = (itemRows ?? [])
    .filter((row) => asString((row as { media_id: string }).media_id) === mediaId)
    .map((row) => asString((row as { id: string }).id))
    .filter(Boolean);
  const audioOnlyIds = (itemRows ?? [])
    .filter(
      (row) =>
        asString((row as { audio_media_id?: string | null }).audio_media_id) === mediaId &&
        asString((row as { media_id: string }).media_id) !== mediaId,
    )
    .map((row) => asString((row as { id: string }).id))
    .filter(Boolean);

  if (visualIds.length > 0) {
    const { error: deleteError } = await client.from("playlist_items").delete().in("id", visualIds);
    throwIfError(deleteError, "Could not remove media from playlists.");
  }
  if (audioOnlyIds.length > 0) {
    const { error: clearError } = await client
      .from("playlist_items")
      .update({ audio_media_id: null, audio_media_version_id: null })
      .in("id", audioOnlyIds);
    throwIfError(clearError, "Could not clear playlist soundtrack.");
  }

  const contentRefs = [...new Set([mediaId, mediaName].filter(Boolean))];
  if (contentRefs.length > 0) {
    const { data: zones, error: zoneError } = await client
      .from("layout_zones")
      .select("id, content_ref")
      .in("content_ref", contentRefs);
    throwIfError(zoneError, "Could not check layout usage.");
    const zoneIds = (zones ?? []).map((row) => asString((row as { id: string }).id)).filter(Boolean);
    if (zoneIds.length > 0) {
      const { error: clearZones } = await client
        .from("layout_zones")
        .update({ content_ref: null })
        .in("id", zoneIds);
      throwIfError(clearZones, "Could not clear layout zone media.");
    }
  }

  const { data: assetRows, error: assetError } = await admin
    .from("manifest_assets")
    .select("manifest_id")
    .eq("media_id", mediaId);
  throwIfError(assetError, "Could not load published packages for this media.");
  const manifestIds = [
    ...new Set(
      (assetRows ?? []).map((row) => asString((row as { manifest_id: string }).manifest_id)).filter(Boolean),
    ),
  ];
  if (manifestIds.length > 0) {
    const { data: manifests, error: manifestError } = await admin
      .from("content_manifests")
      .select("screen_id")
      .in("id", manifestIds);
    throwIfError(manifestError, "Could not load screens for package republish.");
    for (const row of manifests ?? []) {
      const id = asString((row as { screen_id: string }).screen_id);
      if (id) screenIds.add(id);
    }
  }

  return { screenIds: [...screenIds], playlistIds };
}

async function purgeMediaRow(
  client: ReturnType<typeof getUserClient>,
  id: string,
  options: { deleteFromStorage?: boolean; accessToken?: string } = {},
): Promise<void> {
  const deleteFromStorage = shouldDeleteFromStorage(options.deleteFromStorage);
  const { data: mediaMeta, error: mediaMetaError } = await client
    .from("media")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  throwIfError(mediaMetaError, "Could not load media.");
  const mediaName = asString((mediaMeta as { name?: string } | null)?.name);

  const { data: versions, error: versionError } = await client
    .from("media_versions")
    .select("id, storage_key, thumbnail_key")
    .eq("media_id", id);
  throwIfError(versionError, "Could not load media versions.");
  const keys = deleteFromStorage
    ? [
        ...new Set(
          (versions ?? []).flatMap((row) => {
            const storageKey = asNullableString((row as { storage_key: string }).storage_key);
            const thumb = asNullableString((row as { thumbnail_key: string | null }).thumbnail_key);
            return [storageKey, thumb].filter((value): value is string => Boolean(value));
          }),
        ),
      ]
    : [];

  const admin = getServiceRoleClient();
  const { screenIds, playlistIds } = await detachMediaDependents(client, admin, id, mediaName);

  // Push fresh packages without this asset before dropping FK-restricted rows.
  if (options.accessToken && (screenIds.length > 0 || playlistIds.length > 0)) {
    try {
      const { republishScreens, republishScreensUsingPlaylist } = await import("./campaigns.server");
      for (const playlistId of playlistIds) {
        await republishScreensUsingPlaylist(options.accessToken, playlistId);
      }
      await republishScreens(options.accessToken, screenIds);
    } catch (error) {
      console.warn(
        "[media] republish after delete failed",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const { error: deleteAssets } = await admin.from("manifest_assets").delete().eq("media_id", id);
  throwIfError(deleteAssets, "Could not clear published package assets.");

  // playback_logs.media_id is ON DELETE RESTRICT — drop history rows so hard-delete can proceed.
  const { error: deleteLogs } = await admin.from("playback_logs").delete().eq("media_id", id);
  throwIfError(deleteLogs, "Could not clear playback history for this media.");

  const { error: clearCurrent } = await client
    .from("media")
    .update({ current_version_id: null })
    .eq("id", id);
  throwIfError(clearCurrent, "Could not delete media.");
  const { error: deleteVersions } = await client.from("media_versions").delete().eq("media_id", id);
  throwIfError(deleteVersions, "Could not delete media versions.");
  const { error: deleteRow } = await client.from("media").delete().eq("id", id);
  throwIfError(deleteRow, "Could not delete media.");

  if (!deleteFromStorage || keys.length === 0) return;
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
  // Same as listMedia: reconcile in the background so folder list stays snappy.
  if (hasPermission(auth.profile.role, "media.manage")) {
    void reconcilePendingUploadsOnce(client, orgId);
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

export async function deleteFolder(
  accessToken: string,
  id: string,
  _options: { deleteFromStorage?: boolean } = {},
): Promise<boolean> {
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
  const deleteFromStorage = true;

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
      await purgeMediaRow(client, row.id, { deleteFromStorage, accessToken });
    }
    await client.from("media_folders").delete().eq("id", id);
  } catch (error) {
    if (folderGoneFromLibrary) return true;
    const raw = error instanceof Error ? error.message : "";
    throw new Error(
      describeCanceledStatement(
        raw,
        "Could not finish deleting this folder. It is still in the library. Try again.",
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
