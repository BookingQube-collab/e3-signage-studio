import assert from "node:assert/strict";
import test from "node:test";

import { getPublicSupabaseConfig, getServerEnv } from "./env.server.ts";

const KEYS = [
  ["SUPABASE", "URL"],
  ["VITE", "SUPABASE", "URL"],
  ["NEXT", "PUBLIC", "SUPABASE", "URL"],
  ["SUPABASE", "ANON", "KEY"],
  ["VITE", "SUPABASE", "ANON", "KEY"],
  ["NEXT", "PUBLIC", "SUPABASE", "ANON", "KEY"],
  ["SUPABASE", "PUBLISHABLE", "KEY"],
  ["NEXT", "PUBLIC", "SUPABASE", "PUBLISHABLE", "KEY"],
  ["SUPABASE", "SERVICE", "ROLE", "KEY"],
  ["SUPABASE", "SECRET", "KEY"],
] as const;

function name(parts: readonly string[]): string {
  return parts.join("_");
}

function withEnv(values: Record<string, string>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const parts of KEYS) {
    const key = name(parts);
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("public config reads NEXT_PUBLIC url and publishable key aliases", () => {
  withEnv(
    {
      [name(["NEXT", "PUBLIC", "SUPABASE", "URL"])]: "https://example.supabase.co",
      [name(["SUPABASE", "PUBLISHABLE", "KEY"])]: "sb-publishable-anon",
    },
    () => {
      const config = getPublicSupabaseConfig();
      assert.deepEqual(config, {
        url: "https://example.supabase.co",
        anonKey: "sb-publishable-anon",
      });
    },
  );
});

test("service role accepts SUPABASE_SECRET_KEY and stays off public config", () => {
  withEnv(
    {
      [name(["SUPABASE", "URL"])]: "https://example.supabase.co",
      [name(["SUPABASE", "ANON", "KEY"])]: "anon",
      [name(["SUPABASE", "SECRET", "KEY"])]: "super-secret-service-role",
    },
    () => {
      const env = getServerEnv();
      assert.equal(env.supabaseServiceRoleKey, "super-secret-service-role");
      const pub = getPublicSupabaseConfig();
      assert.deepEqual(pub, { url: "https://example.supabase.co", anonKey: "anon" });
      assert.equal(JSON.stringify(pub).includes("super-secret-service-role"), false);
    },
  );
});
