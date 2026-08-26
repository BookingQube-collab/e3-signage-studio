export const DEVICE_TOKEN_ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const DEVICE_TOKEN_GRACE_MS = 24 * 60 * 60 * 1000;

export function isDeviceTokenExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at <= now;
}

export function shouldRotateDeviceToken(
  createdAt: string,
  now = Date.now(),
  rotateAfterMs = DEVICE_TOKEN_ROTATE_AFTER_MS,
): boolean {
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return false;
  return now - at >= rotateAfterMs;
}
