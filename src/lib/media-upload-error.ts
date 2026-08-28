/** Postgres surfaces this when a statement is aborted or times out — never show it raw. */
export function isCanceledStatementError(message: string): boolean {
  return /canceling statement/i.test(message) || /statement timeout/i.test(message);
}

export function describeCanceledStatement(message: string, fallback: string): string {
  if (isCanceledStatementError(message)) return fallback;
  const trimmed = message.trim();
  return trimmed || fallback;
}

export const RESYNC_TIMEOUT_MESSAGE = "Sync took too long; try again";

export function describeResyncError(message: string): string {
  return describeCanceledStatement(message, RESYNC_TIMEOUT_MESSAGE);
}

/** Maps XMLHttpRequest PUT failures (R2 / Supabase) to a toast the operator can act on. */

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function storageLabel(host: string): string {
  if (host.endsWith("r2.cloudflarestorage.com")) return "R2";
  if (host.includes("supabase.co")) return "Supabase storage";
  if (host.includes("vercel.app") || host.endsWith("localhost") || host.startsWith("127.")) {
    return "the CMS API";
  }
  return host || "storage";
}

function snippetFromBody(raw: string | undefined): string {
  if (!raw) return "";
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return text;
}

export function describeBrowserUploadFailure(input: {
  status: number;
  url: string;
  responseText?: string;
}): string {
  const host = hostOf(input.url);
  const where = storageLabel(host);
  const snippet = snippetFromBody(input.responseText);
  const hostHint = host ? ` (${host})` : "";

  if (snippet && isCanceledStatementError(snippet)) {
    return "Upload was interrupted. Try that file again.";
  }

  if (input.status === 0) {
    if (where === "R2") {
      return `Upload blocked by the browser (CORS or Content-Security-Policy)${hostHint}. If the host contains .eu. but ListBucket works without it, fix R2_ENDPOINT and redeploy.`;
    }
    return `Upload blocked by the browser (CORS or connection)${hostHint}.`;
  }
  if (input.status === 403) {
    return `Upload rejected (403) by ${where}${hostHint}.${snippet ? ` ${snippet}` : " Check R2_ENDPOINT, bucket name, and keys."}`;
  }
  if (input.status === 413) {
    return `Upload rejected (413) by ${where}. File is too large.`;
  }
  if (input.status >= 400) {
    return `Upload failed (${input.status}) on ${where}${hostHint}.${snippet ? ` ${snippet}` : ""}`;
  }
  return `Upload failed (${input.status}).`;
}
