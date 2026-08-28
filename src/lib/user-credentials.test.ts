import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPassword,
  assertUsername,
  authEmailForUser,
  isSyntheticLoginEmail,
  loginEmailForIdentifier,
  looksLikeEmail,
  normalizeUsername,
  passwordError,
  SYNTHETIC_LOGIN_DOMAIN,
  syntheticEmailForUsername,
  usernameError,
} from "./user-credentials.ts";

test("normalizes usernames to lowercase trim", () => {
  assert.equal(normalizeUsername("  Ahmed.K  "), "ahmed.k");
});

test("accepts simple usernames and rejects invalid ones", () => {
  assert.equal(usernameError("site1"), null);
  assert.equal(usernameError("booth_ops"), null);
  assert.equal(usernameError("ab"), "Username must be at least 3 characters.");
  assert.ok(usernameError("not an email"));
  assert.ok(usernameError("bad@name"));
  assert.equal(assertUsername("Booth-1"), "booth-1");
  assert.throws(() => assertUsername("x"), /at least 3/);
});

test("passwords need 8–72 characters and no extra complexity", () => {
  assert.equal(passwordError("secret12"), null);
  assert.equal(passwordError("short"), "Password must be at least 8 characters.");
  assert.equal(passwordError("a".repeat(73)), "Password is too long.");
  assert.doesNotThrow(() => assertPassword("password"));
  assert.throws(() => assertPassword("1234567"), /at least 8/);
});

test("username-only accounts use a reserved synthetic email", () => {
  assert.equal(syntheticEmailForUsername("Ahmed"), `ahmed@${SYNTHETIC_LOGIN_DOMAIN}`);
  assert.equal(authEmailForUser({ username: "ahmed" }), `ahmed@${SYNTHETIC_LOGIN_DOMAIN}`);
  assert.equal(authEmailForUser({ username: "ahmed", email: "ahmed@e3.qa" }), "ahmed@e3.qa");
  assert.equal(isSyntheticLoginEmail(`ahmed@${SYNTHETIC_LOGIN_DOMAIN}`), true);
  assert.equal(isSyntheticLoginEmail("ahmed@e3.qa"), false);
});

test("login identifier with @ is treated as email", () => {
  assert.equal(looksLikeEmail("rajan@e3.qa"), true);
  assert.equal(looksLikeEmail("booth_ops"), false);
});

test("username login uses the profile email or the synthetic Auth email", () => {
  assert.equal(loginEmailForIdentifier("waqar"), `waqar@${SYNTHETIC_LOGIN_DOMAIN}`);
  assert.equal(loginEmailForIdentifier("Waqar", "waqar@e3.qa"), "waqar@e3.qa");
  assert.equal(loginEmailForIdentifier("rajan@e3.qa"), "rajan@e3.qa");
});
