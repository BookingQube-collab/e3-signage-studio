import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseConfigFn } from "@/lib/public-config-functions";

export type PublicSupabaseConfig = { url: string; anonKey: string };

const MISSING_SERVER_CONFIG =
  "Supabase is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents).";

function vitePublicValue(parts: readonly string[]): string | undefined {
  try {
    const env = import.meta.env as unknown as Record<string, unknown>;
    const raw = Reflect.get(env, parts.join("_"));
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

function vitePublicConfig(): PublicSupabaseConfig | null {
  const url =
    vitePublicValue(["VITE", "SUPABASE", "URL"]) ??
    vitePublicValue(["NEXT", "PUBLIC", "SUPABASE", "URL"]);
  const anonKey =
    vitePublicValue(["VITE", "SUPABASE", "ANON", "KEY"]) ??
    vitePublicValue(["NEXT", "PUBLIC", "SUPABASE", "ANON", "KEY"]) ??
    vitePublicValue(["NEXT", "PUBLIC", "SUPABASE", "PUBLISHABLE", "KEY"]);
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

let runtimeConfig: PublicSupabaseConfig | null = vitePublicConfig();
let loadPromise: Promise<PublicSupabaseConfig | null> | undefined;
let browserClient: SupabaseClient | undefined;

export function seedPublicSupabaseConfig(config: PublicSupabaseConfig | null): void {
  if (!config?.url || !config?.anonKey) return;
  runtimeConfig = config;
}

/** Local Vite env, or a server-provided url+anon pair (Vercel unprefixed vars). */
export async function ensurePublicSupabaseConfig(): Promise<PublicSupabaseConfig | null> {
  if (runtimeConfig) return runtimeConfig;
  const fromVite = vitePublicConfig();
  if (fromVite) {
    runtimeConfig = fromVite;
    return fromVite;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const config = await getPublicSupabaseConfigFn();
        if (config?.url && config?.anonKey) {
          runtimeConfig = config;
          return config;
        }
      } catch {
        // Fall through to the public GET endpoint.
      }
      if (typeof window === "undefined") return null;
      try {
        const res = await fetch("/api/public-config");
        if (!res.ok) return null;
        const data = (await res.json()) as { url?: string; anonKey?: string };
        if (data.url && data.anonKey) {
          runtimeConfig = { url: data.url, anonKey: data.anonKey };
          return runtimeConfig;
        }
      } catch {
        return null;
      }
      return null;
    })();
  }
  return loadPromise;
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(runtimeConfig ?? vitePublicConfig());
}

function publicEnv(): PublicSupabaseConfig {
  const config = runtimeConfig ?? vitePublicConfig();
  if (!config) {
    throw new Error(MISSING_SERVER_CONFIG);
  }
  return config;
}

/** Browser Supabase client. Uses the anon JWT only — never the service role. */
export function getSupabase(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = publicEnv();
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

export async function getBrowserAccessToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  const config = await ensurePublicSupabaseConfig();
  if (!config) return "";
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? "";
}
