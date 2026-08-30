import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlayerApkUrl, resolvePlayerApkHref } from "./player-apk.ts";

test("normalizePlayerApkUrl rejects empty and placeholder values", () => {
  assert.equal(normalizePlayerApkUrl(undefined), null);
  assert.equal(normalizePlayerApkUrl(""), null);
  assert.equal(normalizePlayerApkUrl("  "), null);
  assert.equal(normalizePlayerApkUrl("undefined"), null);
  assert.equal(normalizePlayerApkUrl("null"), null);
  assert.equal(normalizePlayerApkUrl(" https://cdn.example/player.apk "), "https://cdn.example/player.apk");
});

test("resolvePlayerApkHref keeps absolute URLs and joins relative paths", () => {
  assert.equal(resolvePlayerApkHref(null), null);
  assert.equal(
    resolvePlayerApkHref("https://cdn.example/e3.apk"),
    "https://cdn.example/e3.apk",
  );
  assert.equal(
    resolvePlayerApkHref("/downloads/e3-signage-player.apk", "https://e3-cms.vercel.app"),
    "https://e3-cms.vercel.app/downloads/e3-signage-player.apk",
  );
  assert.equal(
    resolvePlayerApkHref("//cdn.example/e3.apk"),
    "https://cdn.example/e3.apk",
  );
});
