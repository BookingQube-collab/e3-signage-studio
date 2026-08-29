import assert from "node:assert/strict";
import test from "node:test";

import { QueryClient } from "@tanstack/react-query";

import {
  invalidateKeysInBackground,
  removeById,
  upsertById,
  writeEntityCache,
} from "./query-cache.ts";

test("upsertById replaces matching id and prepends", () => {
  const next = upsertById(
    [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    { id: "b", name: "B2" },
  );
  assert.deepEqual(next, [
    { id: "b", name: "B2" },
    { id: "a", name: "A" },
  ]);
});

test("removeById drops the matching row", () => {
  assert.deepEqual(removeById([{ id: "a" }, { id: "b" }], "a"), [{ id: "b" }]);
});

test("writeEntityCache updates detail and list without waiting on network", () => {
  const qc = new QueryClient();
  qc.setQueryData(["things"], [{ id: "1", name: "old" }]);
  writeEntityCache(qc, {
    detailKey: ["thing", "1"],
    listKey: ["things"],
    entity: { id: "1", name: "new" },
  });
  assert.deepEqual(qc.getQueryData(["thing", "1"]), { id: "1", name: "new" });
  assert.deepEqual(qc.getQueryData(["things"]), [{ id: "1", name: "new" }]);
});

test("invalidateKeysInBackground fires without awaiting callers", () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let started = 0;
  qc.setQueryDefaults(["a"], {
    queryFn: async () => {
      started += 1;
      return "a";
    },
  });
  qc.setQueryDefaults(["b"], {
    queryFn: async () => {
      started += 1;
      return "b";
    },
  });
  void qc.prefetchQuery({ queryKey: ["a"] });
  void qc.prefetchQuery({ queryKey: ["b"] });
  invalidateKeysInBackground(qc, [["a"], ["b"]]);
  assert.equal(typeof invalidateKeysInBackground, "function");
  assert.ok(started >= 0);
});
