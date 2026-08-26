/**
 * Server-only environment. Never import this from client components.
 * Device and storage secrets must stay here — they are not VITE_ prefixed.
 *
 * Vercel/Supabase integration injects several name variants at **lambda runtime**.
 * Vite/Nitro often replace `process.env.NAME` with `undefined` at **build**
 * when the name is absent from the build environment. Always:
 *   - look up keys built at runtime (`parts.join("_")`, `Reflect.get`)
 *   - read a live `process.env` (not a bundler snapshot)
 * Public config returns url + anon/publishable only — never service/secret keys.
 */

export type ServerEnv = {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  r2AccountId: string | undefined;
  r2AccessKeyId: string | undefined;
  r2SecretAccessKey: string | undefined;
  r2Bucket: string | undefined;
  r2Endpoint: string | undefined;
};

export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

const CAPTURE_KEY = "__e3_runtime_env__";
const NITRO_CONFIG_KEY = "__e3_nitro_runtime_config__";

type EnvMap = Record<string, string | undefined>;
type KeyParts = readonly string[];

/** URL aliases present on Vercel (legacy + Supabase integration). */
const SUPABASE_URL_KEYS: KeyParts[] = [
  ["SUPABASE", "URL"],
  ["VITE", "SUPABASE", "URL"],
  ["NEXT", "PUBLIC", "SUPABASE", "URL"],
];

/** Anon/publishable aliases — safe to send to the browser. */
const SUPABASE_ANON_KEYS: KeyParts[] = [
  ["SUPABASE", "ANON", "KEY"],
  ["VITE", "SUPABASE", "ANON", "KEY"],
  ["NEXT", "PUBLIC", "SUPABASE", "ANON", "KEY"],
  ["SUPABASE", "PUBLISHABLE", "KEY"],
  ["NEXT", "PUBLIC", "SUPABASE", "PUBLISHABLE", "KEY"],
];

/** Service role / secret — server only. Never returned by public config. */
const SUPABASE_SERVICE_KEYS: KeyParts[] = [
  ["SUPABASE", "SERVICE", "ROLE", "KEY"],
  ["SUPABASE", "SECRET", "KEY"],
];

function envName(parts: KeyParts): string {
  return parts.join("_");
}

function nonempty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  return trimmed;
}

function lookup(map: unknown, name: string): string | undefined {
  if (!map || typeof map !== "object") return undefined;
  return nonempty(Reflect.get(map, name));
}

/** Cloudflare Workers (and some Nitro targets) pass string bindings as fetch(env). */
export function captureRuntimeEnv(env: unknown): void {
  if (!env || typeof env !== "object") return;
  const record = env as Record<string, unknown>;
  // Vercel web handler passes a context object (`waitUntil`), not env bindings.
  if ("waitUntil" in record && !recordHasSupabase(record)) return;

  const g = globalThis as Record<string, unknown>;
  const prev = (g[CAPTURE_KEY] as EnvMap | undefined) ?? {};
  const next: EnvMap = { ...prev };
  for (const [key, value] of Object.entries(record)) {
    const str = nonempty(value);
    if (str) next[key] = str;
  }
  g[CAPTURE_KEY] = next;
}

function recordHasSupabase(record: Record<string, unknown>): boolean {
  for (const parts of [...SUPABASE_URL_KEYS, ...SUPABASE_ANON_KEYS, ...SUPABASE_SERVICE_KEYS]) {
    if (lookup(record, envName(parts))) return true;
  }
  return false;
}

function capturedEnv(): EnvMap | undefined {
  return (globalThis as Record<string, unknown>)[CAPTURE_KEY] as EnvMap | undefined;
}

/**
 * Real Node `process.env`. Avoid `process.env.NAME` and even `process.env`
 * as a static member expression — Vite/Nitro replace those at build.
 * `new Function` + computed `["process"]` / `["env"]` are not rewritten.
 */
function liveProcessEnv(): EnvMap | undefined {
  try {
    const read = new Function(
      "return (typeof globalThis !== 'undefined' && globalThis['process'] && globalThis['process']['env']) ? globalThis['process']['env'] : (typeof process !== 'undefined' && process && process['env'] ? process['env'] : undefined)",
    ) as () => EnvMap | undefined;
    return read();
  } catch {
    return undefined;
  }
}

function bundledProcessEnv(): EnvMap | undefined {
  const g = globalThis as Record<string, unknown>;
  const proc = g["process"] as { env?: EnvMap } | undefined;
  return proc?.env;
}

/** Nitro `useRuntimeConfig()` overlay (camelCase keys + envPrefix ""). */
function hydrateNitroRuntimeEnv(): EnvMap | undefined {
  const g = globalThis as Record<string, unknown>;
  if (g[NITRO_CONFIG_KEY]) return g[NITRO_CONFIG_KEY] as EnvMap;

  try {
    const useRuntimeConfig = g["useRuntimeConfig"] as
      | (() => Record<string, unknown>)
      | undefined;
    if (typeof useRuntimeConfig !== "function") return undefined;
    const cfg = useRuntimeConfig();
    if (!cfg || typeof cfg !== "object") return undefined;
    const mapped: EnvMap = {};
    const pairs: Array<[string, string]> = [
      ["supabaseUrl", envName(["SUPABASE", "URL"])],
      ["viteSupabaseUrl", envName(["VITE", "SUPABASE", "URL"])],
      ["nextPublicSupabaseUrl", envName(["NEXT", "PUBLIC", "SUPABASE", "URL"])],
      ["supabaseAnonKey", envName(["SUPABASE", "ANON", "KEY"])],
      ["viteSupabaseAnonKey", envName(["VITE", "SUPABASE", "ANON", "KEY"])],
      ["nextPublicSupabaseAnonKey", envName(["NEXT", "PUBLIC", "SUPABASE", "ANON", "KEY"])],
      ["supabasePublishableKey", envName(["SUPABASE", "PUBLISHABLE", "KEY"])],
      ["nextPublicSupabasePublishableKey", envName(["NEXT", "PUBLIC", "SUPABASE", "PUBLISHABLE", "KEY"])],
      ["supabaseServiceRoleKey", envName(["SUPABASE", "SERVICE", "ROLE", "KEY"])],
      ["supabaseSecretKey", envName(["SUPABASE", "SECRET", "KEY"])],
    ];
    for (const [camel, name] of pairs) {
      const value = nonempty(cfg[camel]);
      if (value) mapped[name] = value;
    }
    if (Object.keys(mapped).length === 0) return undefined;
    g[NITRO_CONFIG_KEY] = mapped;
    return mapped;
  } catch {
    return undefined;
  }
}

/** Load Nitro runtimeConfig + Node `process.env` once per isolate (no-op in `vite dev`). */
export async function primeNitroRuntimeConfig(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  try {
    const spec = ["node", "process"].join(":");
    const nodeProcess = (await import(/* @vite-ignore */ spec)) as { env?: EnvMap };
    if (nodeProcess?.env) captureRuntimeEnv(nodeProcess.env);
  } catch {
    // Edge / Workers may not have node:process.
  }
  if (g[NITRO_CONFIG_KEY]) return;
  try {
    const spec = ["nitro", "runtime-config"].join("/");
    const mod = (await import(/* @vite-ignore */ spec)) as {
      useRuntimeConfig?: () => Record<string, unknown>;
    };
    if (typeof mod.useRuntimeConfig === "function") {
      g["useRuntimeConfig"] = mod.useRuntimeConfig;
      hydrateNitroRuntimeEnv();
    }
  } catch {
    // Virtual `#nitro/virtual/runtime-config` is build-only.
  }
}

function importMetaPublicEnv(): EnvMap | undefined {
  try {
    const env = import.meta.env as unknown as EnvMap;
    if (!env || typeof env !== "object") return undefined;
    return env;
  } catch {
    return undefined;
  }
}

function envSources(): Array<EnvMap | undefined> {
  return [
    capturedEnv(),
    liveProcessEnv(),
    bundledProcessEnv(),
    hydrateNitroRuntimeEnv(),
    importMetaPublicEnv(),
  ];
}

function readEnvValue(name: string): string | undefined {
  for (const map of envSources()) {
    const value = lookup(map, name);
    if (value) return value;
  }
  return undefined;
}

function readFirst(aliases: KeyParts[]): string | undefined {
  for (const parts of aliases) {
    const value = readEnvValue(envName(parts));
    if (value) return value;
  }
  return undefined;
}

export function getServerEnv(): ServerEnv {
  return {
    supabaseUrl: readFirst(SUPABASE_URL_KEYS),
    supabaseAnonKey: readFirst(SUPABASE_ANON_KEYS),
    supabaseServiceRoleKey: readFirst(SUPABASE_SERVICE_KEYS),
    r2AccountId: readEnvValue(envName(["R2", "ACCOUNT", "ID"])),
    r2AccessKeyId: readEnvValue(envName(["R2", "ACCESS", "KEY", "ID"])),
    r2SecretAccessKey: readEnvValue(envName(["R2", "SECRET", "ACCESS", "KEY"])),
    r2Bucket: readEnvValue(envName(["R2", "BUCKET"])),
    r2Endpoint: readEnvValue(envName(["R2", "ENDPOINT"])),
  };
}

/** Public browser config only — never includes the service role / secret key. */
export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };
}

export function isR2Configured(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.r2AccountId &&
      env.r2AccessKeyId &&
      env.r2SecretAccessKey &&
      env.r2Bucket &&
      env.r2Endpoint,
  );
}

export function assertSupabaseAdmin(): {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
} {
  const env = getServerEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }
  return {
    supabaseUrl: env.supabaseUrl,
    supabaseServiceRoleKey: env.supabaseServiceRoleKey,
  };
}

export function isSupabaseConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
