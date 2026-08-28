import { createHash, createHmac } from "node:crypto";

import { parseS3ListBucketResult, type S3ListBucketPage } from "../lib/r2-list";
import {
  COMPLETE_OBJECT_STAT_TIMEOUT_MS,
  RESYNC_R2_PAGE_SIZE,
  STORAGE_LIST_TIMEOUT_MS,
} from "../lib/media-upload-lifecycle";
import { getServerEnv } from "./env.server";

type HttpMethod = "PUT" | "GET" | "HEAD" | "DELETE";

type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint: string;
};

function requireR2(): R2Config {
  const env = getServerEnv();
  if (
    !env.r2AccountId ||
    !env.r2AccessKeyId ||
    !env.r2SecretAccessKey ||
    !env.r2Bucket ||
    !env.r2Endpoint
  ) {
    throw new Error("Cloudflare R2 is not configured.");
  }
  return {
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
    region: "auto",
    bucket: env.r2Bucket,
    endpoint: env.r2Endpoint.replace(/\/+$/, ""),
  };
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalObjectPath(bucketAndKey: string): string {
  return `/${bucketAndKey
    .split("/")
    .map((part) => encodeRfc3986(part))
    .join("/")}`;
}

function amzDate(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Storage request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function signedUrl(input: {
  method: HttpMethod;
  key?: string;
  expiresIn: number;
  contentType?: string;
  extraQuery?: Array<[string, string]>;
}): { url: string; headers: Record<string, string> } {
  const cfg = requireR2();
  const { amzDate: date, dateStamp } = amzDate();
  const host = new URL(cfg.endpoint).host;
  const credential = `${cfg.accessKeyId}/${dateStamp}/${cfg.region}/s3/aws4_request`;
  const signedHeaders = input.contentType ? "content-type;host" : "host";
  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", date],
    ["X-Amz-Expires", String(input.expiresIn)],
    ["X-Amz-SignedHeaders", signedHeaders],
    ...(input.extraQuery ?? []),
  ];
  query.sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = query.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join("&");
  const canonicalHeaders = input.contentType
    ? `content-type:${input.contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const resource = input.key ? `${cfg.bucket}/${input.key}` : cfg.bucket;
  const canonicalRequest = [
    input.method,
    canonicalObjectPath(resource),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    `${dateStamp}/${cfg.region}/s3/aws4_request`,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp, cfg.region))
    .update(stringToSign, "utf8")
    .digest("hex");
  const encodedKey = input.key ? input.key.split("/").map(encodeRfc3986).join("/") : "";
  const path = encodedKey ? `${cfg.endpoint}/${cfg.bucket}/${encodedKey}` : `${cfg.endpoint}/${cfg.bucket}`;
  const url = `${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const headers: Record<string, string> = {};
  if (input.contentType) headers["Content-Type"] = input.contentType;
  return { url, headers };
}

export function r2CreateUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number,
): { url: string; headers: Record<string, string> } {
  return signedUrl({ method: "PUT", key, expiresIn, contentType });
}

export function r2CreateDownloadUrl(key: string, expiresIn: number): string {
  return signedUrl({ method: "GET", key, expiresIn }).url;
}

function sizeFromObjectHeaders(headers: Headers): { sizeBytes: number; contentType: string | null } {
  const contentType = headers.get("content-type");
  const range = headers.get("content-range");
  if (range) {
    const total = range.split("/")[1];
    const fromRange = total ? Number(total) : NaN;
    if (Number.isFinite(fromRange)) return { sizeBytes: fromRange, contentType };
  }
  const length = headers.get("content-length");
  const fromLength = length ? Number(length) : NaN;
  if (Number.isFinite(fromLength)) return { sizeBytes: fromLength, contentType };
  return { sizeBytes: -1, contentType };
}

async function r2ProbeObjectViaGet(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const { url } = signedUrl({ method: "GET", key, expiresIn: 60 });
  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers: { Range: "bytes=0-0" } },
    COMPLETE_OBJECT_STAT_TIMEOUT_MS,
  );
  if (response.status === 404) return null;
  if (response.status === 200 || response.status === 206) {
    return sizeFromObjectHeaders(response.headers);
  }
  throw new Error(`Could not verify uploaded object (${response.status}).`);
}

export async function r2HeadObject(
  key: string,
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const { url } = signedUrl({ method: "HEAD", key, expiresIn: 60 });
  const response = await fetchWithTimeout(url, { method: "HEAD" }, COMPLETE_OBJECT_STAT_TIMEOUT_MS);
  if (response.status === 404) return null;
  if (response.ok) {
    return sizeFromObjectHeaders(response.headers);
  }
  if (response.status === 400 || response.status === 403 || response.status === 405) {
    return r2ProbeObjectViaGet(key);
  }
  throw new Error(`Could not verify uploaded object (${response.status}).`);
}

export async function r2ListObjectKeysPage(
  prefix: string,
  options?: { maxKeys?: number; continuationToken?: string | null; timeoutMs?: number },
): Promise<S3ListBucketPage> {
  const maxKeys = Math.min(Math.max(options?.maxKeys ?? RESYNC_R2_PAGE_SIZE, 1), 1000);
  const extraQuery: Array<[string, string]> = [
    ["list-type", "2"],
    ["max-keys", String(maxKeys)],
    ["prefix", prefix],
  ];
  if (options?.continuationToken) extraQuery.push(["continuation-token", options.continuationToken]);
  const { url } = signedUrl({ method: "GET", expiresIn: 60, extraQuery });
  const timeoutMs = options?.timeoutMs ?? STORAGE_LIST_TIMEOUT_MS;
  const response = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
  if (!response.ok) throw new Error(`Could not list stored objects (${response.status}).`);
  return parseS3ListBucketResult(await response.text());
}

export async function r2ListObjectKeys(prefix: string, maxPages = 3): Promise<string[]> {
  const keys: string[] = [];
  let token: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const parsed = await r2ListObjectKeysPage(prefix, { maxKeys: RESYNC_R2_PAGE_SIZE, continuationToken: token });
    keys.push(...parsed.keys);
    if (!parsed.nextContinuationToken) break;
    token = parsed.nextContinuationToken;
  }
  return keys;
}

export async function r2DeleteObjects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      const { url } = signedUrl({ method: "DELETE", key, expiresIn: 60 });
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Could not delete object (${response.status}).`);
      }
    }),
  );
}
