/** Sliding-window counters. Durable production hits go through Postgres; this is the unit-tested core. */

export type RateLimitRule = {
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  pair: { limit: 8, windowSeconds: 10 * 60 },
  activate: { limit: 180, windowSeconds: 10 * 60 },
  login: { limit: 10, windowSeconds: 15 * 60 },
  heartbeat: { limit: 30, windowSeconds: 5 * 60 },
  playback: { limit: 40, windowSeconds: 5 * 60 },
  errorLogs: { limit: 40, windowSeconds: 5 * 60 },
  /** Unpaired TVs polling org logo / waiting-screen assets. */
  playerBranding: { limit: 60, windowSeconds: 5 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  hitCount: number;
};

type Hit = { at: number };

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, Hit[]>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  hit(key: string, rule: RateLimitRule): RateLimitDecision {
    const now = this.now();
    const windowMs = rule.windowSeconds * 1000;
    const cutoff = now - windowMs;
    const previous = this.buckets.get(key) ?? [];
    const kept = previous.filter((hit) => hit.at > cutoff);
    kept.push({ at: now });
    this.buckets.set(key, kept);
    const allowed = kept.length <= rule.limit;
    const oldest = kept[0]?.at ?? now;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed, retryAfterSeconds, hitCount: kept.length };
  }
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for") ??
    headers.get("x-real-ip") ??
    "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  if (!first) return "unknown";
  return first.slice(0, 128);
}

export function rateLimitKey(name: RateLimitName, parts: Array<string | null | undefined>): string {
  const suffix = parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
  return `${name}:${suffix || "unknown"}`;
}
