import assert from "node:assert/strict";
import test from "node:test";

import { jwtExpiresWithinMs } from "./jwt-expiry.ts";

function tokenWithExp(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  return `header.${payload}.sig`;
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
