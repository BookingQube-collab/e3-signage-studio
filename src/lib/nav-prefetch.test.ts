import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient } from "@tanstack/react-query";

import { prefetchNavRoute, shellListLoader } from "./nav-prefetch.ts";

test("shellListLoader no-ops without a query client", () => {
  let ran = false;
  const loader = shellListLoader(() => {
    ran = true;
  });
  loader({ context: {} });
  assert.equal(ran, false);
});

test("shellListLoader runs prefetch when queryClient is present", () => {
  let ran = false;
  const qc = new QueryClient();
  const loader = shellListLoader((client) => {
    ran = client === qc;
  });
  const prev = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    value: prev ?? ({} as Window),
    configurable: true,
    writable: true,
  });
  try {
    loader({ context: { queryClient: qc } });
    assert.equal(ran, true);
  } finally {
    if (prev === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        value: prev,
        configurable: true,
        writable: true,
      });
    }
  }
});

test("prefetchNavRoute accepts known sidebar paths without throwing", () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const paths = [
    "/dashboard",
    "/locations",
    "/screens",
    "/media",
    "/playlists",
    "/layouts",
    "/campaigns",
    "/schedule",
    "/reports",
    "/users",
    "/settings",
  ] as const;
  for (const path of paths) {
    assert.doesNotThrow(() => prefetchNavRoute(qc, path));
  }
});
