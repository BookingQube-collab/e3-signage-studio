import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const ACCESS = "e3-sb-access";
const REFRESH = "e3-sb-refresh";
const CHUNK = 1800;
const MAX_CHUNKS = 8;

function cookieBase(): {
  httpOnly: true;
  path: string;
  sameSite: "lax";
  maxAge: number;
  secure?: true;
} {
  const base = {
    httpOnly: true as const,
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
  };
  if (process.env["NODE_ENV"] === "production") {
    return { ...base, secure: true as const };
  }
  return base;
}

function writeChunked(name: string, value: string): void {
  const encoded = encodeURIComponent(value);
  const count = Math.max(1, Math.ceil(encoded.length / CHUNK));
  if (count > MAX_CHUNKS) {
    throw new Error("Session token is too large to store in cookies.");
  }
  const opts = cookieBase();
  setCookie(`${name}-n`, String(count), opts);
  for (let i = 0; i < count; i++) {
    setCookie(`${name}-${i}`, encoded.slice(i * CHUNK, (i + 1) * CHUNK), opts);
  }
}

function readChunked(name: string): string | null {
  const nRaw = getCookie(`${name}-n`);
  if (!nRaw) {
    const single = getCookie(name);
    return single ? decodeURIComponent(single) : null;
  }
  const n = Number(nRaw);
  if (!Number.isFinite(n) || n < 1 || n > MAX_CHUNKS) return null;
  let out = "";
  for (let i = 0; i < n; i++) {
    const part = getCookie(`${name}-${i}`);
    if (part === undefined) return null;
    out += part;
  }
  try {
    return decodeURIComponent(out);
  } catch {
    return out;
  }
}

function clearChunked(name: string): void {
  const opts = { path: "/" };
  deleteCookie(name, opts);
  deleteCookie(`${name}-n`, opts);
  for (let i = 0; i < MAX_CHUNKS; i++) {
    deleteCookie(`${name}-${i}`, opts);
  }
}

export function setAuthCookies(accessToken: string, refreshToken: string): void {
  writeChunked(ACCESS, accessToken);
  writeChunked(REFRESH, refreshToken);
}

export function readAuthCookies(): { accessToken: string; refreshToken: string } | null {
  const accessToken = readChunked(ACCESS);
  const refreshToken = readChunked(REFRESH);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function clearAuthCookies(): void {
  clearChunked(ACCESS);
  clearChunked(REFRESH);
}
