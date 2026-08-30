import assert from "node:assert/strict";
import test from "node:test";

import { canReissueConsumedPairingCode } from "./pairing-activate.ts";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");

test("reissue allowed while pairing code has not expired", () => {
  assert.equal(canReissueConsumedPairingCode("2026-08-30T12:04:00.000Z", NOW), true);
});

test("reissue denied after pairing code expires", () => {
  assert.equal(canReissueConsumedPairingCode("2026-08-30T11:59:59.000Z", NOW), false);
});

test("invalid expires_at cannot reissue", () => {
  assert.equal(canReissueConsumedPairingCode("not-a-date", NOW), false);
});
