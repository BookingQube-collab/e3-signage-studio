import assert from "node:assert/strict";
import test from "node:test";

import { connectivityFromHeartbeat, DEFAULT_OFFLINE_AFTER_SECONDS } from "./connectivity.ts";

const NOW = Date.parse("2026-08-26T13:00:00.000Z");

test("no heartbeat is OFFLINE", () => {
  assert.equal(connectivityFromHeartbeat("READY", null, 300, NOW), "OFFLINE");
});

test("heartbeat within 5 minutes is ONLINE", () => {
  assert.equal(
    connectivityFromHeartbeat("READY", "2026-08-26T12:58:00.000Z", DEFAULT_OFFLINE_AFTER_SECONDS, NOW),
    "ONLINE",
  );
});

test("heartbeat older than 5 minutes is OFFLINE", () => {
  assert.equal(
    connectivityFromHeartbeat("READY", "2026-08-26T12:54:59.000Z", DEFAULT_OFFLINE_AFTER_SECONDS, NOW),
    "OFFLINE",
  );
});

test("DISABLED wins over a fresh heartbeat", () => {
  assert.equal(
    connectivityFromHeartbeat("DISABLED", "2026-08-26T12:59:00.000Z", DEFAULT_OFFLINE_AFTER_SECONDS, NOW),
    "DISABLED",
  );
});
