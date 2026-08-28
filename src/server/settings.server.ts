import type { WaitingScreenBrand } from "@e3/shared-types";
import { WAITING_SCREEN_BRANDS } from "@e3/shared-types";

import { requireCmsPermission } from "@/server/auth.server";
import { DOWNLOAD_URL_TTL_SECONDS, createObjectDownloadUrls } from "@/server/storage.server";
import { getServiceRoleClient, getUserClient } from "@/server/supabase.server";

const TITLE_MAX = 120;
const MESSAGE_MAX = 500;

export type MediaAssetPreview = {
  mediaId: string | null;
  mediaName: string | null;
  thumbnailUrl: string | null;
};

export type WaitingScreenSettings = {
  brand: WaitingScreenBrand;
  mediaId: string | null;
  mediaName: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  message: string | null;
  configVersion: number;
};

export type BrandingSettings = {
  cmsLogo: MediaAssetPreview;
  favicon: MediaAssetPreview;
  /** In-app player icon synced via waiting-screen payload. Not the Android launcher icon. */
  playerBrandIcon: MediaAssetPreview;
  /**
   * Reference art for rebuilding the APK launcher icon.
   * Runtime PackageManager / adaptive-icon APIs are not used on Android TV here —
   * changing this field alone does not update the home-screen icon on installed devices.
   */
  apkLauncherIcon: MediaAssetPreview;
  configVersion: number;
};

export type OrganizationSettingsDto = {
  waitingScreen: WaitingScreenSettings;
  branding: BrandingSettings;
};

export type DeviceBrandAssetPayload = {
  mediaId: string;
  version: number;
  checksum: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
};

export type DeviceWaitingScreenPayload = {
  brand: WaitingScreenBrand;
  mediaId: string | null;
  version: number | null;
  checksum: string | null;
  fileSize: number | null;
  mimeType: string | null;
  downloadUrl: string | null;
  title: string | null;
  message: string | null;
  configVersion: number;
  brandIcon: DeviceBrandAssetPayload | null;
};

export type PublicBrandingDto = {
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
};

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBrand(value: unknown): WaitingScreenBrand {
  if (typeof value === "string" && (WAITING_SCREEN_BRANDS as readonly string[]).includes(value)) {
    return value as WaitingScreenBrand;
  }
  return "FULL_LOGO";
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

async function loadMediaAssetPreview(
  admin: ReturnType<typeof getServiceRoleClient>,
  mediaId: string | null,
): Promise<MediaAssetPreview> {
  if (!mediaId) return { mediaId: null, mediaName: null, thumbnailUrl: null };
  const preview = await loadWaitingMediaPreview(admin, mediaId);
  if (!preview.mediaName && !preview.thumbnailUrl) {
    return { mediaId: null, mediaName: null, thumbnailUrl: null };
  }
  return { mediaId, mediaName: preview.mediaName, thumbnailUrl: preview.thumbnailUrl };
}

async function validateImageMedia(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
  mediaId: string | null,
  label: string,
): Promise<string | null> {
  if (!mediaId) return null;
  const { data: media, error } = await admin
    .from("media")
    .select("id, type, mime_type, organization_id, archived_at, status")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error(error.message || `Could not validate ${label}.`);
  if (!media) throw new Error(`Selected ${label} media was not found.`);
  if (asNullableString((media as { organization_id?: string }).organization_id) !== organizationId) {
    throw new Error(`Selected ${label} media belongs to another organization.`);
  }
  if (asNullableString((media as { archived_at?: string | null }).archived_at)) {
    throw new Error(`Archived media cannot be used as the ${label}.`);
  }
  const mime = asNullableString((media as { mime_type?: string }).mime_type) ?? "";
  const type = asNullableString((media as { type?: string }).type) ?? "";
  if (!mime.startsWith("image/") && type !== "IMAGE" && type !== "LOGO") {
    throw new Error(`${label} must be an image from the media library.`);
  }
  return mediaId;
}

async function bumpScreensConfigVersion(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
): Promise<void> {
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
}

type OrgSettingsRow = {
  default_waiting_brand?: string | null;
  default_waiting_media_id?: string | null;
  default_waiting_title?: string | null;
  default_waiting_message?: string | null;
  waiting_config_version?: number;
  cms_logo_media_id?: string | null;
  cms_favicon_media_id?: string | null;
  player_brand_icon_media_id?: string | null;
  apk_launcher_icon_media_id?: string | null;
  branding_config_version?: number;
};

const ORG_SETTINGS_SELECT =
  "default_waiting_brand, default_waiting_media_id, default_waiting_title, default_waiting_message, waiting_config_version, cms_logo_media_id, cms_favicon_media_id, player_brand_icon_media_id, apk_launcher_icon_media_id, branding_config_version";

async function buildOrganizationSettingsDto(
  data: OrgSettingsRow | null,
): Promise<OrganizationSettingsDto> {
  const admin = getServiceRoleClient();
  const brand = normalizeBrand(data?.default_waiting_brand);
  const waitingMediaId =
    brand === "CUSTOM" ? asNullableString(data?.default_waiting_media_id) : null;
  const waitingPreview = await loadWaitingMediaPreview(admin, waitingMediaId);

  const [cmsLogo, favicon, playerBrandIcon, apkLauncherIcon] = await Promise.all([
    loadMediaAssetPreview(admin, asNullableString(data?.cms_logo_media_id)),
    loadMediaAssetPreview(admin, asNullableString(data?.cms_favicon_media_id)),
    loadMediaAssetPreview(admin, asNullableString(data?.player_brand_icon_media_id)),
    loadMediaAssetPreview(admin, asNullableString(data?.apk_launcher_icon_media_id)),
  ]);

  return {
    waitingScreen: {
      brand,
      mediaId: waitingMediaId,
      mediaName: waitingPreview.mediaName,
      thumbnailUrl: waitingPreview.thumbnailUrl,
      title: asNullableString(data?.default_waiting_title),
      message: asNullableString(data?.default_waiting_message),
      configVersion: Math.max(1, asNumber(data?.waiting_config_version, 1)),
    },
    branding: {
      cmsLogo,
      favicon,
      playerBrandIcon,
      apkLauncherIcon,
      configVersion: Math.max(1, asNumber(data?.branding_config_version, 1)),
    },
  };
}

export async function getOrganizationSettings(accessToken: string): Promise<OrganizationSettingsDto> {
  const auth = await requireCmsPermission(accessToken, "settings.view");
  const client = getUserClient(accessToken);
  const { data, error } = await client
    .from("organization_settings")
    .select(ORG_SETTINGS_SELECT)
    .eq("organization_id", auth.profile.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load organization settings.");

  return buildOrganizationSettingsDto(data as OrgSettingsRow | null);
}

export async function updateWaitingScreenSettings(
  accessToken: string,
  input: {
    brand: WaitingScreenBrand;
    mediaId: string | null;
    title: string | null;
    message: string | null;
  },
): Promise<OrganizationSettingsDto> {
  const auth = await requireCmsPermission(accessToken, "settings.manage");
  const admin = getServiceRoleClient();
  const organizationId = auth.profile.organizationId;
  await ensureOrgSettingsRow(admin, organizationId);

  const brand = normalizeBrand(input.brand);
  const mediaId =
    brand === "CUSTOM"
      ? await validateImageMedia(admin, organizationId, input.mediaId, "waiting screen")
      : null;

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
      default_waiting_brand: brand,
      default_waiting_media_id: mediaId,
      default_waiting_title: title,
      default_waiting_message: message,
      waiting_config_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (updateError) throw new Error(updateError.message || "Could not save waiting screen settings.");

  await bumpScreensConfigVersion(admin, organizationId);
  return getOrganizationSettings(accessToken);
}

export async function updateBrandingSettings(
  accessToken: string,
  input: {
    cmsLogoMediaId: string | null;
    faviconMediaId: string | null;
    playerBrandIconMediaId: string | null;
    apkLauncherIconMediaId: string | null;
  },
): Promise<OrganizationSettingsDto> {
  const auth = await requireCmsPermission(accessToken, "settings.manage");
  const admin = getServiceRoleClient();
  const organizationId = auth.profile.organizationId;
  await ensureOrgSettingsRow(admin, organizationId);

  const [cmsLogoMediaId, faviconMediaId, playerBrandIconMediaId, apkLauncherIconMediaId] =
    await Promise.all([
      validateImageMedia(admin, organizationId, input.cmsLogoMediaId, "CMS logo"),
      validateImageMedia(admin, organizationId, input.faviconMediaId, "favicon"),
      validateImageMedia(admin, organizationId, input.playerBrandIconMediaId, "player brand icon"),
      validateImageMedia(admin, organizationId, input.apkLauncherIconMediaId, "APK launcher icon"),
    ]);

  const { data: current, error: currentError } = await admin
    .from("organization_settings")
    .select("branding_config_version, waiting_config_version, player_brand_icon_media_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message || "Could not load branding version.");

  const prevPlayerIcon = asNullableString(
    (current as { player_brand_icon_media_id?: string | null } | null)?.player_brand_icon_media_id,
  );
  const playerIconChanged = prevPlayerIcon !== playerBrandIconMediaId;

  const nextBrandingVersion =
    Math.max(
      1,
      asNumber((current as { branding_config_version?: number } | null)?.branding_config_version, 1),
    ) + 1;
  const nextWaitingVersion = playerIconChanged
    ? Math.max(
        1,
        asNumber((current as { waiting_config_version?: number } | null)?.waiting_config_version, 1),
      ) + 1
    : undefined;

  const { error: updateError } = await admin
    .from("organization_settings")
    .update({
      cms_logo_media_id: cmsLogoMediaId,
      cms_favicon_media_id: faviconMediaId,
      player_brand_icon_media_id: playerBrandIconMediaId,
      apk_launcher_icon_media_id: apkLauncherIconMediaId,
      branding_config_version: nextBrandingVersion,
      ...(nextWaitingVersion != null ? { waiting_config_version: nextWaitingVersion } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (updateError) throw new Error(updateError.message || "Could not save branding settings.");

  if (playerIconChanged) {
    await bumpScreensConfigVersion(admin, organizationId);
  }

  return getOrganizationSettings(accessToken);
}

async function resolveDefaultOrganizationId(
  admin: ReturnType<typeof getServiceRoleClient>,
): Promise<string | null> {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not resolve organization.");
  return asNullableString((data as { id?: string } | null)?.id);
}

/** Public CMS branding (logo / favicon) for login + site-wide favicon without auth. */
export async function getPublicBranding(): Promise<PublicBrandingDto> {
  const admin = getServiceRoleClient();
  const organizationId = await resolveDefaultOrganizationId(admin);
  if (!organizationId) {
    return { logoUrl: null, faviconUrl: null, version: 1 };
  }

  const { data, error } = await admin
    .from("organization_settings")
    .select("cms_logo_media_id, cms_favicon_media_id, branding_config_version")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load public branding.");

  const row = data as OrgSettingsRow | null;
  const [logo, favicon] = await Promise.all([
    loadMediaAssetPreview(admin, asNullableString(row?.cms_logo_media_id)),
    loadMediaAssetPreview(admin, asNullableString(row?.cms_favicon_media_id)),
  ]);

  return {
    logoUrl: logo.thumbnailUrl,
    faviconUrl: favicon.thumbnailUrl,
    version: Math.max(1, asNumber(row?.branding_config_version, 1)),
  };
}

async function resolveDownloadableImageAsset(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
  mediaId: string | null,
): Promise<DeviceBrandAssetPayload | null> {
  if (!mediaId) return null;

  const { data: media } = await admin
    .from("media")
    .select("id, current_version_id, archived_at, mime_type, type")
    .eq("id", mediaId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!media || asNullableString((media as { archived_at?: string | null }).archived_at)) {
    return null;
  }

  const versionId = asNullableString((media as { current_version_id?: string | null }).current_version_id);
  if (!versionId) return null;

  const { data: version } = await admin
    .from("media_versions")
    .select("version_number, storage_key, checksum_sha256, size_bytes, mime_type")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return null;

  const storageKey = asNullableString((version as { storage_key?: string }).storage_key);
  if (!storageKey) return null;

  const urls = await createObjectDownloadUrls([storageKey], DOWNLOAD_URL_TTL_SECONDS);
  const downloadUrl = urls.get(storageKey) ?? null;
  if (!downloadUrl) return null;

  const checksum = (asNullableString((version as { checksum_sha256?: string }).checksum_sha256) ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) return null;

  return {
    mediaId,
    version: Math.max(1, asNumber((version as { version_number?: number }).version_number, 1)),
    checksum,
    fileSize: Math.max(0, asNumber((version as { size_bytes?: number }).size_bytes, 0)),
    mimeType: asNullableString((version as { mime_type?: string }).mime_type) ?? "image/jpeg",
    downloadUrl,
  };
}

export async function loadDeviceWaitingScreen(
  admin: ReturnType<typeof getServiceRoleClient>,
  organizationId: string,
): Promise<DeviceWaitingScreenPayload> {
  const { data } = await admin
    .from("organization_settings")
    .select(
      "default_waiting_brand, default_waiting_media_id, default_waiting_title, default_waiting_message, waiting_config_version, player_brand_icon_media_id",
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
  let brand = normalizeBrand((data as { default_waiting_brand?: string | null } | null)?.default_waiting_brand);
  const mediaId = asNullableString(
    (data as { default_waiting_media_id?: string | null } | null)?.default_waiting_media_id,
  );
  const playerBrandIconId = asNullableString(
    (data as { player_brand_icon_media_id?: string | null } | null)?.player_brand_icon_media_id,
  );
  const brandIcon = await resolveDownloadableImageAsset(admin, organizationId, playerBrandIconId);

  const empty = (resolvedBrand: WaitingScreenBrand): DeviceWaitingScreenPayload => ({
    brand: resolvedBrand,
    mediaId: null,
    version: null,
    checksum: null,
    fileSize: null,
    mimeType: null,
    downloadUrl: null,
    title,
    message,
    configVersion,
    brandIcon,
  });

  if (brand !== "CUSTOM") return empty(brand);
  if (!mediaId) return empty("FULL_LOGO");

  const customAsset = await resolveDownloadableImageAsset(admin, organizationId, mediaId);
  if (!customAsset) return empty("FULL_LOGO");

  return {
    brand: "CUSTOM",
    mediaId: customAsset.mediaId,
    version: customAsset.version,
    checksum: customAsset.checksum,
    fileSize: customAsset.fileSize,
    mimeType: customAsset.mimeType,
    downloadUrl: customAsset.downloadUrl,
    title,
    message,
    configVersion,
    brandIcon,
  };
}
