/**
 * Android TV player APK download URL helpers.
 * Host the APK on R2/CDN (or Vercel public/) and set PLAYER_APK_URL / VITE_PLAYER_APK_URL.
 */

export type PlayerApkInfo = {
  /** Raw configured value (absolute URL or site-relative path), or null if unset. */
  url: string | null;
  configured: boolean;
};

/** Trim and reject empty / placeholder env values. */
export function normalizePlayerApkUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  return trimmed;
}

/**
 * Turn a configured absolute URL or path into a browser-openable href.
 * Relative paths (e.g. `/downloads/e3-signage-player.apk`) resolve against `origin`.
 */
export function resolvePlayerApkHref(
  configuredUrl: string | null | undefined,
  origin?: string | null,
): string | null {
  const url = normalizePlayerApkUrl(configuredUrl);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) {
    const base = (origin ?? "").replace(/\/$/, "");
    return base ? `${base}${url}` : url;
  }
  return url;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    if (typeof document === "undefined") return false;
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
