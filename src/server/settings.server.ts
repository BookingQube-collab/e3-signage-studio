import { requireCmsPermission } from "@/server/auth.server";
import { DOWNLOAD_URL_TTL_SECONDS, createObjectDownloadUrls } from "@/server/storage.server";
import { getServiceRoleClient, getUserClient } from "@/server/supabase.server";

const TITLE_MAX = 120;
const MESSAGE_MAX = 500;

export type WaitingScreenSettings = {
  mediaId: string | null;
  mediaName: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  message: string | null;
  configVersion: number;
};

export type OrganizationSettingsDto = {
  waitingScreen: WaitingScreenSettings;
};

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTitle(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > TITLE_MAX) {
    throw new Error(`Waiting screen title must be ${TITLE_MAX} characters or fewer.`);
  }
  return trimmed;
}

function normalizeMessage(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MESSAGE_MAX) {
    throw new Error(`Waiting screen message must be ${MESSAGE_MAX} characters or fewer.`);
  }
  return trimmed;
}

async function ensureOrgSettingsRow(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
): Promise<void> {
  const { error } = await admin.from("organization_settings").upsert(
    { organization_id: organizationId },
    { onConflict: "organization_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message || "Could not ensure organization settings.");
}

async function loadWaitingMediaPreview(
  admin: ReturnType<typeof getServiceRoleClient>,
  mediaId: string | null,
): Promise<{ mediaName: string | null; thumbnailUrl: string | null }> {
  if (!mediaId) return { mediaName: null, thumbnailUrl: null };
  const { data: media, error } = await admin
    .from("media")
    .select("id, name, mime_type, current_version_id, archived_at")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load waiting screen media.");
  if (!media || asNullableString((media as { archived_at?: string | null }).archived_at)) {
    return { mediaName: null, thumbnailUrl: null };
  }
  const name = asNullableString((media as { name?: string }).name);
  const versionId = asNullableString((media as { current_version_id?: string | null }).current_version_id);
  if (!versionId) return { mediaName: name, thumbnailUrl: null };
  const { data: version, error: versionError } = await admin
    .from("media_versions")
    .select("storage_key, thumbnail_key, mime_type")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message || "Could not load waiting screen media version.");
  const mime = asNullableString((version as { mime_type?: string } | null)?.mime_type) ?? "";
  const storageKey = asNullableString((version as { storage_key?: string } | null)?.storage_key);
  const thumbKey = asNullableString((version as { thumbnail_key?: string } | null)?.thumbnail_key);
  const previewKey = mime.startsWith("image/") ? storageKey ?? thumbKey : thumbKey ?? storageKey;
  if (!previewKey) return { mediaName: name, thumbnailUrl: null };
  const urls = await createObjectDownloadUrls([previewKey], DOWNLOAD_URL_TTL_SECONDS);
  return { mediaName: name, thumbnailUrl: urls.get(previewKey) ?? null };
}

export async function getOrganizationSettings(accessToken: string): Promise<OrganizationSettingsDto> {
  const auth = await requireCmsPermission(accessToken, "settings.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("organization_settings")
    .select(
      "default_waiting_media_id, default_waiting_title, default_waiting_message, waiting_config_version",
    )
    .eq("organization_id", auth.profile.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load organization settings.");

  const mediaId = asNullableString(
    (data as { default_waiting_media_id?: string | null } | null)?.default_waiting_media_id,
  );
  const admin = getServiceRoleClient();
  const preview = await loadWaitingMediaPreview(admin, mediaId);

  return {
    waitingScreen: {
      mediaId,
      mediaName: preview.mediaName,
      thumbnailUrl: preview.thumbnailUrl,
      title: asNullableString(
        (data as { default_waiting_title?: string | null } | null)?.default_waiting_title,
      ),
      message: asNullableString(
        (data as { default_waiting_message?: string | null } | null)?.default_waiting_message,
      ),
      configVersion: Math.max(
        1,
        asNumber(
          (data as { waiting_config_version?: number } | null)?.waiting_config_version,
          1,
        ),
      ),
    },
  };
}

export async function updateWaitingScreenSettings(
  accessToken: string,
  input: {
    mediaId: string | null;
    title: string | null;
    message: string | null;
  },
): Promise<OrganizationSettingsDto> {
  const auth = await requireCmsPermission(accessToken, "settings.manage");
  const admin = getServiceRoleClient();
  const organizationId = auth.profile.organizationId;
  await ensureOrgSettingsRow(admin, organizationId);

  const mediaId = input.mediaId;
  if (mediaId) {
    const { data: media, error } = await admin
      .from("media")
      .select("id, type, mime_type, organization_id, archived_at, status")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Could not validate waiting screen media.");
    if (!media) throw new Error("Selected media was not found.");
    if (asNullableString((media as { organization_id?: string }).organization_id) !== organizationId) {
      throw new Error("Selected media belongs to another organization.");
    }
    if (asNullableString((media as { archived_at?: string | null }).archived_at)) {
      throw new Error("Archived media cannot be used as the waiting screen.");
    }
    const mime = asNullableString((media as { mime_type?: string }).mime_type) ?? "";
    const type = asNullableString((media as { type?: string }).type) ?? "";
    if (!mime.startsWith("image/") && type !== "IMAGE" && type !== "LOGO") {
      throw new Error("Waiting screen must be an image from the media library.");
    }
  }

  const title = normalizeTitle(input.title);
  const message = normalizeMessage(input.message);

  const { data: current, error: currentError } = await admin
    .from("organization_settings")
    .select("waiting_config_version")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message || "Could not load waiting screen version.");
  const nextVersion =
    Math.max(1, asNumber((current as { waiting_config_version?: number } | null)?.waiting_config_version, 1)) +
    1;

  const { error: updateError } = await admin
    .from("organization_settings")
    .update({
      default_waiting_media_id: mediaId,
      default_waiting_title: title,
      default_waiting_message: message,
      waiting_config_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (updateError) throw new Error(updateError.message || "Could not save waiting screen settings.");

  const { data: screenRows, error: screenError } = await admin
    .from("screens")
    .select("id, cloud_config_version")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  if (screenError) throw new Error(screenError.message || "Could not load screens for config bump.");

  for (const row of screenRows ?? []) {
    const screenId = asNullableString((row as { id?: string }).id);
    if (!screenId) continue;
    const nextConfig =
      Math.max(0, asNumber((row as { cloud_config_version?: number | null }).cloud_config_version, 0)) + 1;
    await admin.from("screens").update({ cloud_config_version: nextConfig }).eq("id", screenId);
    await admin
      .from("device_sync_states")
      .update({ cloud_config_version: nextConfig, updated_at: new Date().toISOString() })
      .eq("screen_id", screenId);
  }

  return getOrganizationSettings(accessToken);
}

export type DeviceWaitingScreenPayload = {
  mediaId: string | null;
  version: number | null;
  checksum: string | null;
  fileSize: number | null;
  mimeType: string | null;
  downloadUrl: string | null;
  title: string | null;
  message: string | null;
  configVersion: number;
};

export async function loadDeviceWaitingScreen(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
): Promise<DeviceWaitingScreenPayload> {
  const { data } = await admin
    .from("organization_settings")
    .select(
      "default_waiting_media_id, default_waiting_title, default_waiting_message, waiting_config_version",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  const configVersion = Math.max(
    1,
    asNumber((data as { waiting_config_version?: number } | null)?.waiting_config_version, 1),
  );
  const title = asNullableString(
    (data as { default_waiting_title?: string | null } | null)?.default_waiting_title,
  );
  const message = asNullableString(
    (data as { default_waiting_message?: string | null } | null)?.default_waiting_message,
  );
  const mediaId = asNullableString(
    (data as { default_waiting_media_id?: string | null } | null)?.default_waiting_media_id,
  );

  const empty: DeviceWaitingScreenPayload = {
    mediaId: null,
    version: null,
    checksum: null,
    fileSize: null,
    mimeType: null,
    downloadUrl: null,
    title,
    message,
    configVersion,
  };

  if (!mediaId) return empty;

  const { data: media } = await admin
    .from("media")
    .select("id, current_version_id, archived_at, mime_type, type")
    .eq("id", mediaId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!media || asNullableString((media as { archived_at?: string | null }).archived_at)) {
    return empty;
  }

  const versionId = asNullableString((media as { current_version_id?: string | null }).current_version_id);
  if (!versionId) return empty;

  const { data: version } = await admin
    .from("media_versions")
    .select("version_number, storage_key, checksum_sha256, size_bytes, mime_type")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return empty;

  const storageKey = asNullableString((version as { storage_key?: string }).storage_key);
  if (!storageKey) return empty;

  const urls = await createObjectDownloadUrls([storageKey], DOWNLOAD_URL_TTL_SECONDS);
  const downloadUrl = urls.get(storageKey) ?? null;
  if (!downloadUrl) return empty;

  const checksum = (asNullableString((version as { checksum_sha256?: string }).checksum_sha256) ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) return empty;

  return {
    mediaId,
    version: Math.max(1, asNumber((version as { version_number?: number }).version_number, 1)),
    checksum,
    fileSize: Math.max(0, asNumber((version as { size_bytes?: number }).size_bytes, 0)),
    mimeType: asNullableString((version as { mime_type?: string }).mime_type) ?? "image/jpeg",
    downloadUrl,
    title,
    message,
    configVersion,
  };
}
