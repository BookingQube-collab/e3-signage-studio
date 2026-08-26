import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function publicEnv(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }
  return { url, anonKey };
}

let browserClient: SupabaseClient | undefined;

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
  if (!isSupabaseBrowserConfigured()) return "";
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? "";
}
