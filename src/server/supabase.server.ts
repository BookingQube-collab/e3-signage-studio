import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "./env.server";

export function getServiceRoleClient(): SupabaseClient {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getUserClient(accessToken: string): SupabaseClient {
  const env = getServerEnv();
  const anonKey = env.supabaseAnonKey;
  if (!env.supabaseUrl || !anonKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }
  return createClient(env.supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function isServiceRoleConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
