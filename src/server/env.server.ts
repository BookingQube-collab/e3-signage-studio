/**
 * Server-only environment. Never import this from client components.
 * Device and storage secrets must stay here — they are not VITE_ prefixed.
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

export function getServerEnv(): ServerEnv {
  const env = globalThis.process?.env ?? {};
  return {
    supabaseUrl: env["SUPABASE_URL"] ?? env["VITE_SUPABASE_URL"],
    supabaseAnonKey: env["SUPABASE_ANON_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"],
    supabaseServiceRoleKey: env["SUPABASE_SERVICE_ROLE_KEY"],
    r2AccountId: env["R2_ACCOUNT_ID"],
    r2AccessKeyId: env["R2_ACCESS_KEY_ID"],
    r2SecretAccessKey: env["R2_SECRET_ACCESS_KEY"],
    r2Bucket: env["R2_BUCKET"],
    r2Endpoint: env["R2_ENDPOINT"],
  };
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
