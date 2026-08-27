import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient } from "@tanstack/react-query";

import type { AuthSessionResult } from "./auth-types.ts";
import {
  ADMIN_QUERY_STALE_MS,
  AUTH_SESSION_QUERY_KEY,
  AUTH_SESSION_STALE_MS,
  clearShellAuth,
  loadShellAuth,
} from "./query-defaults.ts";

const ok: AuthSessionResult = {
  ok: true,
  userId: "user-1",
  email: "ops@e3.test",
  profile: {
    id: "profile-1",
    organizationId: "org-1",
    name: "Ops",
    email: "ops@e3.test",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    locationIds: [],
    lastActiveAt: null,
  },
  permissions: [],
};

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: AUTH_SESSION_STALE_MS, retry: false },
    },
  });
}

test("admin list cache outlives a 30s monitoring poll", () => {
  assert.equal(ADMIN_QUERY_STALE_MS > 30_000, true);
});


test("loadShellAuth reuses the query cache within the stale window", async () => {
  const qc = client();
  let calls = 0;
  const fetchAuth = async (): Promise<AuthSessionResult> => {
    calls += 1;
    return ok;
  };
  const first = await loadShellAuth(qc, fetchAuth);
  const second = await loadShellAuth(qc, fetchAuth);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(qc.getQueryData(AUTH_SESSION_QUERY_KEY), ok);
});

test("clearShellAuth drops the cached session so the next load refetches", async () => {
  const qc = client();
  let calls = 0;
  const fetchAuth = async (): Promise<AuthSessionResult> => {
    calls += 1;
    return ok;
  };
  await loadShellAuth(qc, fetchAuth);
  clearShellAuth(qc);
  await loadShellAuth(qc, fetchAuth);
  assert.equal(calls, 2);
});
