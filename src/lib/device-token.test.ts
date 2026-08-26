import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVICE_TOKEN_GRACE_MS,
  DEVICE_TOKEN_ROTATE_AFTER_MS,
  isDeviceTokenExpired,
  shouldRotateDeviceToken,
} from "./device-token.ts";

const NOW = Date.parse("2026-08-26T13:00:00.000Z");

test("tokens rotate after seven days and stay valid during the grace window", () => {
  const created = new Date(NOW - DEVICE_TOKEN_ROTATE_AFTER_MS).toISOString();
  assert.equal(shouldRotateDeviceToken(created, NOW), true);
  assert.equal(shouldRotateDeviceToken(new Date(NOW - DEVICE_TOKEN_ROTATE_AFTER_MS + 1).toISOString(), NOW), false);
  assert.equal(isDeviceTokenExpired(null, NOW), false);
  assert.equal(isDeviceTokenExpired(new Date(NOW + DEVICE_TOKEN_GRACE_MS).toISOString(), NOW), false);
  assert.equal(isDeviceTokenExpired(new Date(NOW - 1).toISOString(), NOW), true);
});
