export type JwtAccessClaims = {
  sub: string;
  email: string | null;
  expMs: number;
};

/** Decode JWT claims without verifying the signature (PostgREST/GoTrue still validate). */
export function readJwtAccessClaims(token: string): JwtAccessClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };
    const sub = typeof json.sub === "string" && json.sub.length > 0 ? json.sub : null;
    const exp = typeof json.exp === "number" ? json.exp : Number.NaN;
    if (!sub || !Number.isFinite(exp)) return null;
    return {
      sub,
      email: typeof json.email === "string" && json.email.length > 0 ? json.email : null,
      expMs: exp * 1000,
    };
  } catch {
    return null;
  }
}

/** Decode JWT `exp` without verifying the signature (GoTrue still validates the token). */
export function jwtExpiresWithinMs(token: string, withinMs: number, nowMs = Date.now()): boolean {
  const claims = readJwtAccessClaims(token);
  if (!claims) return true;
  return claims.expMs <= nowMs + withinMs;
}
