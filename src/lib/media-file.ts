import {
  ALLOWED_MEDIA_MIME,
  HARD_MAX_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  isAllowedMediaMime,
  maxUploadBytesForMime,
  type AllowedMediaMime,
  type UploadByteLimits,
} from "../../packages/validation/src/index.ts";

const MIME_BY_EXT: Record<string, AllowedMediaMime> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

export function fileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function safeMediaFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "media";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").replace(/^\.+/g, "_");
  const trimmed = cleaned.trim() || "media";
  return trimmed.slice(0, 255);
}

/**
 * Rename is CMS metadata only. Keep a playable extension so the library card
 * stays visible; never invent a new storage object.
 */
export function renameMediaDisplayName(currentName: string, nextName: string): string {
  const safe = safeMediaFilename(nextName);
  const currentExt = fileExtension(currentName);
  const nextExt = fileExtension(safe);
  if (nextExt && MIME_BY_EXT[nextExt]) return safe;
  if (!currentExt) return safe;
  const stem =
    nextExt && safe.toLowerCase().endsWith(nextExt)
      ? safe.slice(0, safe.length - nextExt.length)
      : safe;
  const trimmedStem = stem.replace(/\.+$/g, "").trim() || "media";
  return `${trimmedStem}${currentExt}`.slice(0, 255);
}

export type ParsedMediaStorageKey = {
  organizationId: string;
  mediaId: string;
  versionNumber: number;
  checksumSha256: string;
  mime: AllowedMediaMime;
};

const STORAGE_KEY_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v(\d+)\/([a-f0-9]{64})\.(jpg|jpeg|png|webp|mp4)$/i;

export function parseMediaStorageKey(key: string): ParsedMediaStorageKey | null {
  const match = STORAGE_KEY_RE.exec(key.trim());
  if (!match) return null;
  const ext = `.${(match[5] ?? "").toLowerCase()}`;
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  const versionNumber = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) return null;
  return {
    organizationId: (match[1] ?? "").toLowerCase(),
    mediaId: (match[2] ?? "").toLowerCase(),
    versionNumber,
    checksumSha256: (match[4] ?? "").toLowerCase(),
    mime,
  };
}

export function restoredLibraryFilename(mediaId: string, mime: AllowedMediaMime): string {
  const short = mediaId.replace(/-/g, "").slice(0, 8);
  return `restored-${short}.${extensionForMime(mime)}`;
}

/** Keep both files when two uploads share a name — never replace or hide the other. */
export function uniqueLibraryFilename(existingNames: string[], filename: string): string {
  const safe = safeMediaFilename(filename);
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!taken.has(safe.toLowerCase())) return safe;
  const ext = fileExtension(safe);
  const stem = ext && safe.toLowerCase().endsWith(ext) ? safe.slice(0, safe.length - ext.length) : safe;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate.slice(0, 255);
  }
  return `${stem.slice(0, Math.max(1, 240 - String(Date.now()).length))} (${Date.now()})${ext}`.slice(0, 255);
}

export function inferMediaMime(filename: string, reportedType: string): AllowedMediaMime | null {
  const reported = reportedType.trim().toLowerCase();
  if (isAllowedMediaMime(reported)) return reported;
  const fromExt = MIME_BY_EXT[fileExtension(filename)];
  return fromExt ?? null;
}

export function mediaTypeFromMime(mime: AllowedMediaMime): "VIDEO" | "IMAGE" {
  return mime.startsWith("video/") ? "VIDEO" : "IMAGE";
}

export function extensionForMime(mime: AllowedMediaMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "mp4";
}

export function uploadLimitMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

export function uploadLimitsHint(): string {
  return `Images up to ${uploadLimitMb(MAX_IMAGE_UPLOAD_BYTES)} MB · Videos up to ${uploadLimitMb(MAX_VIDEO_UPLOAD_BYTES)} MB`;
}

export class MediaUploadTooLargeError extends Error {
  readonly status = 413;
  constructor(kind: "Image" | "Video", maxMb: number) {
    super(`${kind} is too large. Maximum is ${maxMb} MB.`);
    this.name = "MediaUploadTooLargeError";
  }
}

export function assertUploadSize(
  mime: AllowedMediaMime,
  sizeBytes: number,
  limits?: UploadByteLimits,
): void {
  const max = maxUploadBytesForMime(mime, limits);
  if (sizeBytes <= 0) throw new Error("File is empty.");
  if (sizeBytes > max) {
    const kind = mime.startsWith("video/") ? "Video" : "Image";
    throw new MediaUploadTooLargeError(kind, uploadLimitMb(max));
  }
}

export function collectUploadableFiles(files: File[]): { accepted: File[]; errors: string[] } {
  const accepted: File[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const mime = inferMediaMime(file.name, file.type);
    if (!mime) {
      errors.push(`Unsupported file type: ${file.name}. Use JPEG, PNG, WebP, or MP4.`);
      continue;
    }
    try {
      assertUploadSize(mime, file.size);
      accepted.push(file);
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "Too large."}`);
    }
  }
  return { accepted, errors };
}

export function normalizeChecksum(value: string): string {
  return value.trim().toLowerCase();
}

export function hueFromChecksum(checksum: string): number {
  const hex = checksum.replace(/[^a-f0-9]/gi, "").slice(0, 8);
  if (hex.length < 2) return 210;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return 210;
  return n % 360;
}

export function buildStorageKey(input: {
  organizationId: string;
  mediaId: string;
  versionNumber: number;
  checksumSha256: string;
  mime: AllowedMediaMime;
}): string {
  const checksum = normalizeChecksum(input.checksumSha256);
  return `${input.organizationId}/${input.mediaId}/v${input.versionNumber}/${checksum}.${extensionForMime(input.mime)}`;
}

export function isAllowedMediaFilename(filename: string): boolean {
  return MIME_BY_EXT[fileExtension(filename)] != null || inferMediaMime(filename, "") != null;
}

export const ACCEPT_MEDIA =
  "image/jpeg,image/png,image/webp,video/mp4,.jpg,.jpeg,.png,.webp,.mp4";

export {
  ALLOWED_MEDIA_MIME,
  HARD_MAX_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
};
