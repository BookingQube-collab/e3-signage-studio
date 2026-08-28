import assert from "node:assert/strict";
import test from "node:test";

import {
  authStorageKey,
  mapPasswordGrantError,
  peekBrowserAccessToken,
  sessionFromGrantPayload,
} from "./password-grant.ts";

test("auth storage key uses the Supabase project ref", () => {
  assert.equal(
    authStorageKey("https://abcd1234.supabase.co"),
    "sb-abcd1234-auth-token",
  );
});

test("grant payload maps to a session", () => {
  const session = sessionFromGrantPayload({
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "u1" },
  });
  assert.equal(session?.access_token, "access");
  assert.equal(session?.refresh_token, "refresh");
  assert.equal(session?.token_type, "bearer");
  assert.equal(typeof session?.expires_at, "number");
});

test("invalid credentials are not reported as a timeout", () => {
  assert.equal(
    mapPasswordGrantError(400, { error_description: "Invalid login credentials" }),
    "Invalid username, email, or password.",
  );
});

test("peekBrowserAccessToken reads supabase-js localStorage without getSession", () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        get length() {
          return store.size;
        },
        key(index: number) {
          return [...store.keys()][index] ?? null;
        },
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        },
      },
    },
  });
  store.set(
    "sb-abcd1234-auth-token",
    JSON.stringify({ access_token: "peek-token", refresh_token: "r" }),
  );
  assert.equal(peekBrowserAccessToken(), "peek-token");
});
