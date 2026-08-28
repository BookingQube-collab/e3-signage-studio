import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeSignedOutFlag,
  isSigningOut,
  markSigningOut,
  withTimeout,
} from "./sign-out.ts";

test("withTimeout returns the value when the promise wins", async () => {
  const value = await withTimeout(Promise.resolve("ok"), 50);
  assert.equal(value, "ok");
});

test("withTimeout gives up instead of hanging", async () => {
  const started = Date.now();
  const value = await withTimeout(new Promise<string>(() => undefined), 40);
  assert.equal(value, undefined);
  assert.equal(Date.now() - started < 200, true);
});

test("withTimeout swallows rejections so logout still continues", async () => {
  const value = await withTimeout(Promise.reject(new Error("network")), 50);
  assert.equal(value, undefined);
});

test("signed-out flag is consumed once", () => {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: fake });
  assert.equal(isSigningOut(), false);
  markSigningOut();
  assert.equal(isSigningOut(), true);
  assert.equal(consumeSignedOutFlag(), true);
  assert.equal(consumeSignedOutFlag(), false);
});
