// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Vite only inlines VITE_* into the browser bundle. Vercel/Supabase syncs
 * unprefixed SUPABASE_URL and SUPABASE_ANON_KEY. Map those onto VITE_* at
 * config load so production builds work without duplicate env names.
 * Do not copy SUPABASE_SERVICE_ROLE_KEY (must stay server-only).
 */
function mapPublicSupabaseEnv() {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const url =
    process.env.VITE_SUPABASE_URL ||
    fileEnv.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    "";
  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    fileEnv.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    fileEnv.SUPABASE_ANON_KEY ||
    "";
  if (url) process.env.VITE_SUPABASE_URL = url;
  if (anonKey) process.env.VITE_SUPABASE_ANON_KEY = anonKey;
  return { url, anonKey };
}

const publicSupabase = mapPublicSupabaseEnv();

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      ...(publicSupabase.url
        ? { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicSupabase.url) }
        : {}),
      ...(publicSupabase.anonKey
        ? { "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(publicSupabase.anonKey) }
        : {}),
    },
  },
});

