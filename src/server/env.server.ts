/**
 * Server-only environment. Never import this from client components.
 * Device and storage secrets must stay here — they are not VITE_ prefixed.
 *
 * Vercel/Supabase integration injects unprefixed vars at **lambda runtime**.
 * Vite/Nitro often replace `process.env.NAME` with `undefined` at **build**
 * when the name is absent from the build environment. Read through dynamic
 * keys and a live `process.env` lookup so runtime values are visible.
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

type EnvMap = Record<string, string | undefined>;

function nonempty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  return trimmed;
}

/** Cloudflare Workers (and some Nitro targets) pass string bindings as fetch(env). */
export function captureRuntimeEnv(env: unknown): void {
  if (!env || typeof env !== "object") return;
  const record = env as Record<string, unknown>;
  // Vercel web handler passes a context object (`waitUntil`), not env bindings.
  if ("waitUntil" in record && nonempty(record["SUPABASE_URL"]) === undefined) return;

  const g = globalThis as Record<string, unknown>;
  const prev = (g[CAPTURE_KEY] as EnvMap | undefined) ?? {};
  const next: EnvMap = { ...prev };
  for (const [key, value] of Object.entries(record)) {
    const str = nonempty(value);
    if (str) next[key] = str;
  }
  g[CAPTURE_KEY] = next;
}

function capturedEnv(): EnvMap | undefined {
  return (globalThis as Record<string, unknown>)[CAPTURE_KEY] as EnvMap | undefined;
}

/**
 * Return the real Node `process.env` even if the bundler inlined a snapshot
 * of `process.env.SOME_KEY`. `new Function` is not rewritten by Vite define.
 */
function liveProcessEnv(): EnvMap | undefined {
  try {
    const read = new Function(
      "return (typeof process !== 'undefined' && process && process.env) ? process.env : undefined",
    ) as () => EnvMap | undefined;
    return read();
  } catch {
    return undefined;
  }
}

function bundledProcessEnv(): EnvMap | undefined {
  const proc = (globalThis as { process?: { env?: EnvMap } }).process;
  return proc?.env;
}

function vitePublicFallback(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string | undefined {
  try {
    const env = import.meta.env;
    return nonempty(name === "VITE_SUPABASE_URL" ? env.VITE_SUPABASE_URL : env.VITE_SUPABASE_ANON_KEY);
  } catch {
    return undefined;
  }
}

function readEnvValue(name: string): string | undefined {
  const maps: Array<EnvMap | undefined> = [liveProcessEnv(), capturedEnv(), bundledProcessEnv()];
  for (const map of maps) {
    const value = nonempty(map?.[name]);
    if (value) return value;
  }
  return undefined;
}

export function getServerEnv(): ServerEnv {
  const supabaseUrl =
    readEnvValue("SUPABASE_URL") ??
    readEnvValue("VITE_SUPABASE_URL") ??
    vitePublicFallback("VITE_SUPABASE_URL");
  const supabaseAnonKey =
    readEnvValue("SUPABASE_ANON_KEY") ??
    readEnvValue("VITE_SUPABASE_ANON_KEY") ??
    vitePublicFallback("VITE_SUPABASE_ANON_KEY");

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey: readEnvValue("SUPABASE_SERVICE_ROLE_KEY"),
    r2AccountId: readEnvValue("R2_ACCOUNT_ID"),
    r2AccessKeyId: readEnvValue("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: readEnvValue("R2_SECRET_ACCESS_KEY"),
    r2Bucket: readEnvValue("R2_BUCKET"),
    r2Endpoint: readEnvValue("R2_ENDPOINT"),
  };
}

/** Public browser config only — never includes the service role key. */
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
