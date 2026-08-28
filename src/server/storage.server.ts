import type { AllowedMediaMime } from "@e3/validation";

import { isR2Configured, getServerEnv } from "./env.server";
import {
  r2CreateDownloadUrl,
  r2CreateUploadUrl,
  r2DeleteObjects,
  r2HeadObject,
  r2ListObjectKeys,
} from "./r2-sign.server";
import { getServiceRoleClient } from "./supabase.server";

export const MEDIA_BUCKET = "media";
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export type SignedUpload = {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresInSeconds: number;
};

export function storageBackendName(): "r2" | "supabase" {
  return isR2Configured() ? "r2" : "supabase";
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

export async function listStoredObjectKeys(prefix: string): Promise<Set<string> | null> {
  if (!isR2Configured()) return null;
  try {
    const keys = await r2ListObjectKeys(prefix);
    return new Set(keys);
  } catch {
    return null;
  }
}

export async function statObject(key: string): Promise<{ sizeBytes: number } | null> {
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
