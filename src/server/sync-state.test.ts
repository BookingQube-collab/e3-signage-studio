import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionPackage, canTransitionSync, shouldFetchManifest } from "./sync-state.ts";

test("does not fetch the full manifest when the local version already matches", () => {
  assert.equal(shouldFetchManifest(22, 22), false);
  assert.equal(shouldFetchManifest(21, 22), true);
  assert.equal(shouldFetchManifest(0, 1), true);
});

test("FAILED never transitions directly to ACTIVE", () => {
  assert.equal(canTransitionPackage("FAILED", "ACTIVE"), false);
  assert.equal(canTransitionPackage("DOWNLOADING", "ACTIVE"), false);
  assert.equal(canTransitionPackage("READY", "ACTIVE"), true);
  assert.equal(canTransitionPackage("VERIFYING", "READY"), true);
});

test("one screen can stay OFFLINE without blocking others from ACTIVE", () => {
  assert.equal(canTransitionSync("DOWNLOADING", "ACTIVE"), false);
  assert.equal(canTransitionSync("READY", "ACTIVE"), true);
  assert.equal(canTransitionSync("OFFLINE", "ACTIVE"), true);
  assert.equal(canTransitionSync("ACTIVE", "OFFLINE"), true);
});
