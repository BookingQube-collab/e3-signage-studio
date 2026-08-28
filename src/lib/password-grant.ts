import { LOGIN_AUTH_WAIT_MS } from "./login-flow.ts";
import type { PublicSupabaseConfig } from "./supabase.ts";

export type PasswordGrantSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
};

export type PasswordGrantResult =
  | { ok: true; session: PasswordGrantSession }
  | { ok: false; message: string; timedOut?: boolean };

export function authStorageKey(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).hostname;
  const ref = host.split(".")[0] || "auth";
  return `sb-${ref}-auth-token`;
}

export function mapPasswordGrantError(status: number, body: unknown): string {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const description =
    (typeof record["error_description"] === "string" && record["error_description"]) ||
    (typeof record["msg"] === "string" && record["msg"]) ||
    (typeof record["message"] === "string" && record["message"]) ||
    "";
  const lower = description.toLowerCase();
  if (status === 429) return "Too many sign-in attempts. Try again in a few minutes.";
  if (lower.includes("invalid login") || lower.includes("invalid credentials") || status === 400) {
    return "Invalid username, email, or password.";
  }
  if (lower.includes("email not confirmed")) return "Confirm your email before signing in.";
  return description || "Could not sign in.";
}

export function sessionFromGrantPayload(body: unknown): PasswordGrantSession | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (typeof row["access_token"] !== "string" || typeof row["refresh_token"] !== "string") {
    return null;
  }
  const expiresIn = typeof row["expires_in"] === "number" ? row["expires_in"] : undefined;
  const expiresAt =
    typeof row["expires_at"] === "number"
      ? row["expires_at"]
      : expiresIn != null
        ? Math.floor(Date.now() / 1000) + expiresIn
        : undefined;
  return {
    access_token: row["access_token"],
    refresh_token: row["refresh_token"],
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: typeof row["token_type"] === "string" ? row["token_type"] : "bearer",
    user: row["user"],
  };
}

/** Password grant against GoTrue — skips supabase-js init/lock, which was hanging the login button. */
export async function signInWithPasswordGrant(
  config: PublicSupabaseConfig,
  email: string,
  password: string,
  waitMs = LOGIN_AUTH_WAIT_MS,
): Promise<PasswordGrantResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), waitMs);
  try {
    const res = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, message: mapPasswordGrantError(res.status, body) };
    }
    const session = sessionFromGrantPayload(body);
    if (!session) {
      return { ok: false, message: "Sign-in did not return a session." };
    }
    return { ok: true, session };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: "Sign-in timed out. Try again.", timedOut: true };
    }
    return { ok: false, message: "Network error. Check your connection." };
  } finally {
    clearTimeout(timer);
  }
}

export function seedBrowserAuthSession(supabaseUrl: string, session: PasswordGrantSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(authStorageKey(supabaseUrl), JSON.stringify(session));
  } catch {
    // Private mode — httpOnly cookies still carry the session.
  }
}

/** Read a stored access token without calling getSession() (avoids a hung auth client). */
export function peekBrowserAccessToken(): string {
  if (typeof window === "undefined") return "";
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      if (key.includes("code-verifier")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        access_token?: unknown;
        currentSession?: { access_token?: unknown };
      };
      const token = parsed.access_token ?? parsed.currentSession?.access_token;
      if (typeof token === "string" && token.length > 0) return token;
    }
  } catch {
    return "";
  }
  return "";
}
