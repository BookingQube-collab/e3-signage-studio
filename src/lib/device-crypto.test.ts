import assert from "node:assert/strict";
import test from "node:test";

import { generatePairingCode, hashDeviceToken, hashPairingCode } from "./device-crypto.ts";
import { wallTimeToIso } from "./zoned-time.ts";

test("pairing codes are 6 digits and hash stably", () => {
  const code = generatePairingCode();
  assert.match(code, /^\d{6}$/);
  assert.equal(hashPairingCode("583 294"), hashPairingCode("583294"));
  assert.notEqual(hashPairingCode("000001"), hashPairingCode("000002"));
});

test("device tokens hash to a 64-char hex digest", () => {
  const digest = hashDeviceToken("secret-token");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, hashDeviceToken("secret-token"));
});

test("converts Asia/Qatar wall time to UTC ISO", () => {
  assert.equal(wallTimeToIso("2026-08-25", "12:00", "Asia/Qatar"), "2026-08-25T09:00:00.000Z");
});
