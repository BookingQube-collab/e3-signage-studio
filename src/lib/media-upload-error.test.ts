import assert from "node:assert/strict";
import test from "node:test";

import { describeBrowserUploadFailure } from "./media-upload-error.ts";

const r2 =
  "https://5943ff30718b0c415cee9c1d7a5e95b4.r2.cloudflarestorage.com/e3-content-management/key";
const r2Eu =
  "https://5943ff30718b0c415cee9c1d7a5e95b4.eu.r2.cloudflarestorage.com/e3-content-management/key";
const supabase = "https://example.supabase.co/storage/v1/object/media/key";

test("status 0 on R2 names CORS/CSP and includes the host", () => {
  const message = describeBrowserUploadFailure({ status: 0, url: r2 });
  assert.match(message, /CORS or Content-Security-Policy/);
  assert.match(message, /5943ff30718b0c415cee9c1d7a5e95b4\.r2\.cloudflarestorage\.com/);
});

test("status 0 on EU R2 host tells them to drop .eu. if ListBucket works without it", () => {
  const message = describeBrowserUploadFailure({ status: 0, url: r2Eu });
  assert.match(message, /\.eu\./);
  assert.match(message, /R2_ENDPOINT/);
});

test("403 includes storage host and R2 XML snippet", () => {
  const message = describeBrowserUploadFailure({
    status: 403,
    url: r2,
    responseText: "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
  });
  assert.match(message, /403/);
  assert.match(message, /Access Denied/);
});

test("413 is distinct from the generic connection toast", () => {
  const message = describeBrowserUploadFailure({ status: 413, url: supabase });
  assert.match(message, /413/);
  assert.match(message, /too large/i);
});

test("other HTTP errors include status and host", () => {
  const message = describeBrowserUploadFailure({ status: 500, url: r2, responseText: "Internal" });
  assert.match(message, /500/);
  assert.match(message, /Internal/);
});
