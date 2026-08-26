import { createHash, createHmac } from "node:crypto";

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

function signedUrl(input: {
  method: HttpMethod;
  key: string;
  expiresIn: number;
  contentType?: string;
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
  ];
  query.sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = query.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join("&");
  const canonicalHeaders = input.contentType
    ? `content-type:${input.contentType}\nhost:${host}\n`
    : `host:${host}\n`;
  const canonicalRequest = [
    input.method,
    canonicalObjectPath(`${cfg.bucket}/${input.key}`),
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
  const encodedKey = input.key.split("/").map(encodeRfc3986).join("/");
  const url = `${cfg.endpoint}/${cfg.bucket}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;
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

export async function r2HeadObject(key: string): Promise<{ sizeBytes: number } | null> {
  const { url } = signedUrl({ method: "HEAD", key, expiresIn: 60 });
  const response = await fetch(url, { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not verify uploaded object (${response.status}).`);
  }
  const length = response.headers.get("content-length");
  const sizeBytes = length ? Number(length) : NaN;
  if (!Number.isFinite(sizeBytes)) return null;
  return { sizeBytes };
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
