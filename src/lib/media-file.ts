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
