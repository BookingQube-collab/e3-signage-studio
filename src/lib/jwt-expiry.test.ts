import assert from "node:assert/strict";
import test from "node:test";

import { jwtExpiresWithinMs, readJwtAccessClaims } from "./jwt-expiry.ts";

function tokenWithClaims(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `header.${payload}.sig`;
}

function tokenWithExp(exp: number): string {
  return tokenWithClaims({ sub: "user-1", exp });
}

test("fresh access tokens skip a Supabase setSession round-trip", () => {
  const now = 1_700_000_000_000;
  const exp = Math.floor((now + 10 * 60_000) / 1000);
  assert.equal(jwtExpiresWithinMs(tokenWithExp(exp), 120_000, now), false);
});

test("tokens that expire within two minutes still refresh", () => {
  const now = 1_700_000_000_000;
  const exp = Math.floor((now + 30_000) / 1000);
  assert.equal(jwtExpiresWithinMs(tokenWithExp(exp), 120_000, now), true);
});

test("malformed tokens are treated as expired", () => {
  assert.equal(jwtExpiresWithinMs("not-a-jwt", 120_000, Date.now()), true);
});

test("readJwtAccessClaims returns sub and email from a valid payload", () => {
  const claims = readJwtAccessClaims(
    tokenWithClaims({ sub: "abc", email: "a@b.co", exp: 1_700_000_000 }),
  );
  assert.deepEqual(claims, {
    sub: "abc",
    email: "a@b.co",
    expMs: 1_700_000_000_000,
  });
});

test("readJwtAccessClaims rejects payloads without sub", () => {
  assert.equal(readJwtAccessClaims(tokenWithClaims({ exp: 1_700_000_000 })), null);
});
