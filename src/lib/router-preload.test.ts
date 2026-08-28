import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient } from "@tanstack/react-query";

import {
  hasQueryClientContext,
  isEvictedPreloadMatchError,
  safePreloadRoute,
} from "./router-preload.ts";

test("hasQueryClientContext is false when context or queryClient is missing", () => {
  assert.equal(hasQueryClientContext(undefined), false);
  assert.equal(hasQueryClientContext(null), false);
  assert.equal(hasQueryClientContext({}), false);
  assert.equal(hasQueryClientContext({ queryClient: undefined }), false);
});

test("hasQueryClientContext is true when createRouter passed a client", () => {
  assert.equal(hasQueryClientContext({ queryClient: new QueryClient() }), true);
});

test("isEvictedPreloadMatchError matches the router-core preload race", () => {
  assert.equal(
    isEvictedPreloadMatchError(
      new TypeError("Cannot read properties of undefined (reading '_nonReactive')"),
    ),
    true,
  );
  assert.equal(isEvictedPreloadMatchError(new TypeError("queryClient")), false);
  assert.equal(isEvictedPreloadMatchError(new Error("_nonReactive")), false);
  assert.equal(isEvictedPreloadMatchError("nope"), false);
});

test("safePreloadRoute skips when queryClient is missing", async () => {
  let ran = false;
  const result = await safePreloadRoute(undefined, async () => {
    ran = true;
    return "loaded";
  });
  assert.equal(ran, false);
  assert.equal(result, undefined);
});

test("safePreloadRoute swallows the evicted-match TypeError and rethrows others", async () => {
  const ctx = { queryClient: new QueryClient() };
  const skipped = await safePreloadRoute(ctx, async () => {
    throw new TypeError("Cannot read properties of undefined (reading '_nonReactive')");
  });
  assert.equal(skipped, undefined);

  await assert.rejects(
    () =>
      safePreloadRoute(ctx, async () => {
        throw new Error("chunk failed");
      }),
    /chunk failed/,
  );
});
