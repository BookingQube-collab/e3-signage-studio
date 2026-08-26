import { createHash } from "node:crypto";

import {
  RATE_LIMITS,
  SlidingWindowLimiter,
  clientIpFromHeaders,
  rateLimitKey,
  type RateLimitDecision,
  type RateLimitName,
} from "@/lib/rate-limit";
import { getServiceRoleClient } from "./supabase.server";

const memory = new SlidingWindowLimiter();

function asDecision(value: unknown): RateLimitDecision | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row["allowed"] !== "boolean") return null;
  return {
    allowed: row["allowed"],
    retryAfterSeconds: Math.max(0, Number(row["retryAfterSeconds"] ?? 0)),
    hitCount: Math.max(0, Number(row["hitCount"] ?? 0)),
  };
}

async function hitDurable(key: string, name: RateLimitName): Promise<RateLimitDecision | null> {
  const rule = RATE_LIMITS[name];
  try {
    const admin = getServiceRoleClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) return null;
    return asDecision(data);
  } catch {
    return null;
  }
}

export async function consumeRateLimit(
  name: RateLimitName,
  parts: Array<string | null | undefined>,
): Promise<RateLimitDecision> {
  const key = rateLimitKey(name, parts);
  const durable = await hitDurable(key, name);
  if (durable) return durable;
  return memory.hit(key, RATE_LIMITS[name]);
}

export function requestIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

export function hashLoginIdentity(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex").slice(0, 32);
}
