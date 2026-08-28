import type { AllowedMediaMime } from "@e3/validation";

import { isR2Configured, getServerEnv } from "./env.server";
import {
  r2CreateDownloadUrl,
  r2CreateUploadUrl,
  r2DeleteObjects,
  r2HeadObject,
  r2ListObjectKeysPage,
  r2SumPrefixBytes,
} from "./r2-sign.server";
import { getServiceRoleClient, isServiceRoleConfigured } from "./supabase.server";

export const MEDIA_BUCKET = "media";
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

/** Re-measure Cloudflare usage at most this often (dashboard polls ~30s). */
export const CLOUD_STORAGE_CACHE_TTL_MS = 5 * 60 * 1000;
/** Default org media quota when settings/env omit one (8 GiB). Alert when used >= this. */
export const DEFAULT_CLOUD_STORAGE_QUOTA_BYTES = 8 * 1024 * 1024 * 1024;

export type SignedUpload = {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresInSeconds: number;
};

export type OrgCloudStorageUsage = {
  usedBytes: number;
  quotaBytes: number;
  source: "r2" | "media_library" | "cache";
  measuredAt: string;
};

type MemoryCacheEntry = {
  usedBytes: number;
  measuredAtMs: number;
  source: OrgCloudStorageUsage["source"];
};

const memoryCloudUsage = new Map<string, MemoryCacheEntry>();

export function storageBackendName(): "r2" | "supabase" {
  return isR2Configured() ? "r2" : "supabase";
}

function parsePositiveBytes(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return fallback;
}

export function resolveCloudStorageQuotaBytes(orgQuota: unknown): number {
  const env = getServerEnv();
  return parsePositiveBytes(
    orgQuota,
    parsePositiveBytes(env.cloudStorageQuotaBytes, DEFAULT_CLOUD_STORAGE_QUOTA_BYTES),
  );
}

async function sumMediaLibraryBytes(organizationId: string): Promise<number> {
  if (!isServiceRoleConfigured()) return 0;
  const admin = getServiceRoleClient();
  const { data, error } = await admin
    .from("media_versions")
    .select("size_bytes, media!inner(organization_id, archived_at)")
    .eq("media.organization_id", organizationId)
    .is("media.archived_at", null);
  if (error) throw new Error(error.message || "Could not sum media library sizes.");
  let total = 0;
  for (const row of data ?? []) {
    const n = (row as { size_bytes?: unknown }).size_bytes;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

async function persistCloudUsageCache(
  organizationId: string,
  usedBytes: number,
  measuredAt: string,
): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  try {
    const admin = getServiceRoleClient();
    await admin
      .from("organization_settings")
      .update({
        cloud_storage_used_bytes: usedBytes,
        cloud_storage_measured_at: measuredAt,
        updated_at: measuredAt,
      })
      .eq("organization_id", organizationId);
  } catch {
    // Cache write is best-effort — dashboard still returns the measured value.
  }
}

/**
 * Actual Cloudflare R2 bytes under `{orgId}/` (ListObjects Size sum), cached ~5 minutes.
 * Falls back to summing media_versions when R2 is unavailable.
 */
export async function getOrgCloudStorageUsage(input: {
  organizationId: string;
  quotaBytes?: unknown;
  cachedUsedBytes?: unknown;
  cachedMeasuredAt?: unknown;
  nowMs?: number;
}): Promise<OrgCloudStorageUsage> {
  const nowMs = input.nowMs ?? Date.now();
  const quotaBytes = resolveCloudStorageQuotaBytes(input.quotaBytes);
  const orgId = input.organizationId;

  const mem = memoryCloudUsage.get(orgId);
  if (mem && nowMs - mem.measuredAtMs < CLOUD_STORAGE_CACHE_TTL_MS) {
    return {
      usedBytes: mem.usedBytes,
      quotaBytes,
      source: mem.source,
      measuredAt: new Date(mem.measuredAtMs).toISOString(),
    };
  }

  const cachedUsed =
    typeof input.cachedUsedBytes === "number" && Number.isFinite(input.cachedUsedBytes)
      ? Math.max(0, Math.floor(input.cachedUsedBytes))
      : null;
  const cachedAtMs =
    typeof input.cachedMeasuredAt === "string" && input.cachedMeasuredAt
      ? Date.parse(input.cachedMeasuredAt)
      : NaN;
  if (
    cachedUsed != null &&
    Number.isFinite(cachedAtMs) &&
    nowMs - cachedAtMs < CLOUD_STORAGE_CACHE_TTL_MS
  ) {
    memoryCloudUsage.set(orgId, {
      usedBytes: cachedUsed,
      measuredAtMs: cachedAtMs,
      source: "cache",
    });
    return {
      usedBytes: cachedUsed,
      quotaBytes,
      source: "cache",
      measuredAt: new Date(cachedAtMs).toISOString(),
    };
  }

  let usedBytes = 0;
  let source: OrgCloudStorageUsage["source"] = "media_library";
  try {
    if (isR2Configured()) {
      const listed = await r2SumPrefixBytes(`${orgId}/`, {
        maxPages: 50,
        pageSize: 1000,
        timeoutMs: 8_000,
      });
      usedBytes = listed.usedBytes;
      source = "r2";
    } else {
      usedBytes = await sumMediaLibraryBytes(orgId);
      source = "media_library";
    }
  } catch {
    if (cachedUsed != null) {
      return {
        usedBytes: cachedUsed,
        quotaBytes,
        source: "cache",
        measuredAt:
          Number.isFinite(cachedAtMs) && cachedAtMs > 0
            ? new Date(cachedAtMs).toISOString()
            : new Date(nowMs).toISOString(),
      };
    }
    try {
      usedBytes = await sumMediaLibraryBytes(orgId);
      source = "media_library";
    } catch {
      usedBytes = 0;
      source = "media_library";
    }
  }

  const measuredAt = new Date(nowMs).toISOString();
  memoryCloudUsage.set(orgId, { usedBytes, measuredAtMs: nowMs, source });
  void persistCloudUsageCache(orgId, usedBytes, measuredAt);
  return { usedBytes, quotaBytes, source, measuredAt };
}

export async function createObjectUploadUrl(
  key: string,
  contentType: AllowedMediaMime,
  userAccessToken: string,
): Promise<SignedUpload> {
  if (isR2Configured()) {
    const signed = r2CreateUploadUrl(key, contentType, UPLOAD_URL_TTL_SECONDS);
    return {
      url: signed.url,
      method: "PUT",
      headers: signed.headers,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }

  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return {
    url: `${env.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${MEDIA_BUCKET}/${encodedKey}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      apikey: env.supabaseAnonKey,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}

export async function createObjectDownloadUrls(
  keys: string[],
  expiresIn = DOWNLOAD_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  if (isR2Configured()) {
    for (const key of unique) {
      out.set(key, r2CreateDownloadUrl(key, expiresIn));
    }
    return out;
  }

  const client = getServiceRoleClient();
  const { data, error } = await client.storage.from(MEDIA_BUCKET).createSignedUrls(unique, expiresIn);
  if (error) throw new Error(error.message);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) {
      out.set(item.path, item.signedUrl);
    }
  }
  return out;
}

export async function createObjectDownloadUrl(key: string, expiresIn = DOWNLOAD_URL_TTL_SECONDS): Promise<string> {
  const map = await createObjectDownloadUrls([key], expiresIn);
  const url = map.get(key);
  if (!url) throw new Error("Could not create a download URL.");
  return url;
}

export async function listStoredObjectKeysPage(
  prefix: string,
  options?: {
    maxKeys?: number;
    continuationToken?: string | null;
    timeoutMs?: number;
    throwOnError?: boolean;
  },
): Promise<{ keys: string[]; nextContinuationToken: string | null } | null> {
  if (!isR2Configured()) return null;
  try {
    return await r2ListObjectKeysPage(prefix, options);
  } catch (error) {
    if (options?.throwOnError) throw error;
    return null;
  }
}

export async function statObject(
  key: string,
): Promise<{ sizeBytes: number; contentType?: string | null } | null> {
  if (isR2Configured()) {
    return r2HeadObject(key);
  }

  const client = getServiceRoleClient();
  const folder = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  const filename = key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
  const { data, error } = await client.storage.from(MEDIA_BUCKET).list(folder, {
    search: filename,
    limit: 20,
  });
  if (error) throw new Error(error.message);
  const match = (data ?? []).find((item) => item.name === filename);
  if (!match) return null;
  const meta = match.metadata;
  const raw =
    meta && typeof meta === "object" && "size" in meta ? (meta as { size?: unknown }).size : undefined;
  const sizeBytes =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && Number.isFinite(Number(raw))
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(sizeBytes)) return { sizeBytes: -1 };
  return { sizeBytes };
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return;
  if (isR2Configured()) {
    await r2DeleteObjects(unique);
    return;
  }
  const client = getServiceRoleClient();
  const { error } = await client.storage.from(MEDIA_BUCKET).remove(unique);
  if (error) throw new Error(error.message);
}
