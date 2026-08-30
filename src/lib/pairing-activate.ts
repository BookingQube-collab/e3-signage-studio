/**
 * Decide whether a consumed pairing code may still return ACTIVATED credentials.
 * Covers lost HTTP responses / client retries after the CMS already consumed the code.
 */
export function canReissueConsumedPairingCode(
  expiresAt: string,
  nowMs: number = Date.now(),
): boolean {
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return false;
  return expires >= nowMs;
}
