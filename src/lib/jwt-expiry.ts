/** Decode JWT `exp` without verifying the signature (GoTrue still validates the token). */
export function jwtExpiresWithinMs(token: string, withinMs: number, nowMs = Date.now()): boolean {
  try {
    const part = token.split(".")[1];
    if (!part) return true;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { exp?: unknown };
    const exp = typeof json.exp === "number" ? json.exp : Number.NaN;
    if (!Number.isFinite(exp)) return true;
    return exp * 1000 <= nowMs + withinMs;
  } catch {
    return true;
  }
}
