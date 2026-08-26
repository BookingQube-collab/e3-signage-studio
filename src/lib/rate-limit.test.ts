import assert from "node:assert/strict";
import test from "node:test";

import {
  RATE_LIMITS,
  SlidingWindowLimiter,
  clientIpFromHeaders,
  rateLimitKey,
} from "./rate-limit.ts";

test("allows hits up to the limit then blocks until the window slides", () => {
  let now = 1_000;
  const limiter = new SlidingWindowLimiter(() => now);
  const rule = { limit: 3, windowSeconds: 60 };
  assert.equal(limiter.hit("login:a", rule).allowed, true);
  assert.equal(limiter.hit("login:a", rule).allowed, true);
  assert.equal(limiter.hit("login:a", rule).allowed, true);
  const blocked = limiter.hit("login:a", rule);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  now += 60_000;
  assert.equal(limiter.hit("login:a", rule).allowed, true);
});

test("isolates buckets so one IP does not starve another", () => {
  const limiter = new SlidingWindowLimiter(() => 5_000);
  const rule = { limit: 1, windowSeconds: 30 };
  assert.equal(limiter.hit("pair:1.1.1.1", rule).allowed, true);
  assert.equal(limiter.hit("pair:1.1.1.1", rule).allowed, false);
  assert.equal(limiter.hit("pair:9.9.9.9", rule).allowed, true);
});

test("pair and login rules are tighter than heartbeat ingest", () => {
  assert.ok(RATE_LIMITS.pair.limit < RATE_LIMITS.heartbeat.limit);
  assert.ok(RATE_LIMITS.login.limit < RATE_LIMITS.playback.limit);
  assert.ok(RATE_LIMITS.activate.limit > RATE_LIMITS.pair.limit);
});

test("reads the leftmost forwarded IP", () => {
  const headers = new Headers({
    "x-forwarded-for": " 203.0.113.10, 10.0.0.1",
  });
  assert.equal(clientIpFromHeaders(headers), "203.0.113.10");
  assert.equal(clientIpFromHeaders(new Headers()), "unknown");
  assert.equal(rateLimitKey("login", ["203.0.113.10", "Admin@E3.QA"]), "login:203.0.113.10|admin@e3.qa");
});
