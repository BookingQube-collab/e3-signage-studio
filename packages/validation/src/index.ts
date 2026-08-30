import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const timeOfDaySchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM");

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, "Expected SHA-256 hex digest");

export const pairingCodeSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 6, "Pairing code must be 6 digits");

export const timezoneSchema = z.string().min(1).max(64);

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const nonEmptyNameSchema = z.string().trim().min(1).max(200);

export const mimeTypeSchema = z.string().min(3).max(128);

export const positiveIntSchema = z.number().int().positive();

export const nonNegativeIntSchema = z.number().int().min(0);

export const percentSchema = z.number().min(0).max(100);

export const idempotencyKeySchema = z.string().uuid();

export const storageKeySchema = z.string().min(1).max(1024);

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_VIDEO_MIME = ["video/mp4"] as const;
export const ALLOWED_AUDIO_MIME = ["audio/mpeg"] as const;
export const ALLOWED_MEDIA_MIME = [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME, ...ALLOWED_AUDIO_MIME] as const;
export type AllowedMediaMime = (typeof ALLOWED_MEDIA_MIME)[number];

/** CMS upload caps. Player download-plan skip sizes are separate (not an upload limit). */
export const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;
export const HARD_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export const mediaMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "audio/mpeg"]);

export function isAllowedMediaMime(value: string): value is AllowedMediaMime {
  return (ALLOWED_MEDIA_MIME as readonly string[]).includes(value);
}

export type UploadByteLimits = {
  imageBytes?: number;
  videoBytes?: number;
  audioBytes?: number;
};

export function parseUploadByteLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(HARD_MAX_UPLOAD_BYTES, Math.floor(n));
}

export function maxUploadBytesForMime(mime: AllowedMediaMime, limits?: UploadByteLimits): number {
  if (mime.startsWith("video/")) return limits?.videoBytes ?? MAX_VIDEO_UPLOAD_BYTES;
  if (mime.startsWith("audio/")) return limits?.audioBytes ?? MAX_AUDIO_UPLOAD_BYTES;
  return limits?.imageBytes ?? MAX_IMAGE_UPLOAD_BYTES;
}

export const checksumPayloadSchema = z.object({
  algorithm: z.literal("SHA-256"),
  value: sha256Schema,
});
