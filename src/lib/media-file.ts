import {
  ALLOWED_MEDIA_MIME,
  isAllowedMediaMime,
  maxUploadBytesForMime,
  type AllowedMediaMime,
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

export function assertUploadSize(mime: AllowedMediaMime, sizeBytes: number): void {
  const max = maxUploadBytesForMime(mime);
  if (sizeBytes <= 0) throw new Error("File is empty.");
  if (sizeBytes > max) {
    const mb = Math.round(max / (1024 * 1024));
    throw new Error(`File is too large. Maximum is ${mb} MB for this type.`);
  }
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

export { ALLOWED_MEDIA_MIME };
