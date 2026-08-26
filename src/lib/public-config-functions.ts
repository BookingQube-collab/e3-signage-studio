import { createServerFn } from "@tanstack/react-start";

/** Runtime public Supabase config (url + anon only). Safe for the browser. */
export const getPublicSupabaseConfigFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string; anonKey: string } | null> => {
    const { getPublicSupabaseConfig } = await import("@/server/env.server");
    return getPublicSupabaseConfig();
  },
);
