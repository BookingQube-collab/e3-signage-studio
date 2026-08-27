import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPairingCodeDigits,
  pairingCodeDigits,
  pairingCodeLinkError,
} from "./pairing-code.ts";

test("strips spaces and punctuation from pairing codes", () => {
  assert.equal(pairingCodeDigits("583 294"), "583294");
  assert.equal(pairingCodeDigits("58-32-94"), "583294");
});

test("rejects pairing codes that are not 6 digits", () => {
  assert.equal(assertPairingCodeDigits("583294"), "583294");
  assert.throws(() => assertPairingCodeDigits("58329"), /6 digits/);
  assert.throws(() => assertPairingCodeDigits(""), /6 digits/);
});

test("pairing codes can be reused only for the same unconsumed screen", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");
  const fresh = {
    expiresAt: "2026-08-27T12:05:00.000Z",
    consumedAt: null,
    screenId: null,
  };
  assert.equal(pairingCodeLinkError(fresh, "screen-a", now), null);

  assert.equal(
    pairingCodeLinkError({ ...fresh, screenId: "screen-a" }, "screen-a", now),
    null,
  );
  assert.match(
    pairingCodeLinkError({ ...fresh, screenId: "screen-b" }, "screen-a", now) ?? "",
    /another screen/,
  );
  assert.match(
    pairingCodeLinkError({ ...fresh, consumedAt: "2026-08-27T11:00:00.000Z" }, "screen-a", now) ??
      "",
    /already used/,
  );
  assert.match(
    pairingCodeLinkError({ ...fresh, expiresAt: "2026-08-27T11:59:00.000Z" }, "screen-a", now) ?? "",
    /expired/,
  );
});
