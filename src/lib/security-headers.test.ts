import assert from "node:assert/strict";
import test from "node:test";

import { SECURITY_HEADERS, withSecurityHeaders } from "./security-headers.ts";

test("admin responses advertise HSTS, CSP, and clickjacking protections", () => {
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"] ?? "", /max-age=63072000/);
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  const csp = SECURITY_HEADERS["Content-Security-Policy"] ?? "";
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.match(csp, /https:\/\/\*\.supabase\.co/);
  assert.match(csp, /https:\/\/\*\.r2\.cloudflarestorage\.com/);
  assert.match(csp, /https:\/\/\*\.eu\.r2\.cloudflarestorage\.com/);
});

test("caller headers win over defaults so CORS and Retry-After still apply", () => {
  const merged = withSecurityHeaders({
    "Access-Control-Allow-Origin": "*",
    "Retry-After": "30",
  });
  assert.equal(merged["Access-Control-Allow-Origin"], "*");
  assert.equal(merged["Retry-After"], "30");
  assert.equal(merged["X-Frame-Options"], "DENY");
});
