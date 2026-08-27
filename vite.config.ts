// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const PUBLIC_URL_NAMES = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

const PUBLIC_ANON_NAMES = [
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

function firstPublicEnv(fileEnv: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = (process.env[name] || fileEnv[name] || "").trim();
    if (value && value !== "undefined" && value !== "null") return value;
  }
  return "";
}

/**
 * Best-effort: copy public URL/anon aliases onto VITE_* when they exist at
 * config evaluation. This is NOT sufficient on Vercel — integration vars are
 * often runtime-only, so a define here can bake empty values. Production login
 * loads url+anon from the server at runtime (`getPublicSupabaseConfigFn`).
 * Do not copy SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY (server-only).
 */
function mapPublicSupabaseEnv() {
  const mode = process.env["NODE_ENV"] === "production" ? "production" : "development";
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const url = firstPublicEnv(fileEnv, PUBLIC_URL_NAMES);
  const anonKey = firstPublicEnv(fileEnv, PUBLIC_ANON_NAMES);
  if (url) process.env["VITE_SUPABASE_URL"] = url;
  if (anonKey) process.env["VITE_SUPABASE_ANON_KEY"] = anonKey;
  return { url, anonKey };
}

const publicSupabase = mapPublicSupabaseEnv();

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    router: {
      codeSplittingOptions: {
        defaultBehavior: [
          ["component"],
          ["pendingComponent"],
          ["errorComponent"],
          ["notFoundComponent"],
        ],
      },
    },
  },
  // Pin Vercel for this host; Lovable sandbox still overwrites to cloudflare-module.
  // runtimeConfig + empty envPrefix lets Nitro overlay process.env at lambda runtime.
  nitro: {
    preset: "vercel",
    runtimeConfig: {
      nitro: { envPrefix: "" },
      supabaseUrl: "",
      viteSupabaseUrl: "",
      nextPublicSupabaseUrl: "",
      supabaseAnonKey: "",
      viteSupabaseAnonKey: "",
      nextPublicSupabaseAnonKey: "",
      supabasePublishableKey: "",
      nextPublicSupabasePublishableKey: "",
      supabaseServiceRoleKey: "",
      supabaseSecretKey: "",
    },
  } as { preset?: string },
  vite: {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
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
