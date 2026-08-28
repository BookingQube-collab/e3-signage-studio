import assert from "node:assert/strict";
import test from "node:test";

import { shouldSkipLoginSessionRedirect } from "./login-flow.ts";

test("login page does not wait on a session check when logged out", () => {
  assert.equal(
    shouldSkipLoginSessionRedirect({ loggedOut: true, signedOutFlag: false, accessToken: "tok" }),
    true,
  );
  assert.equal(
    shouldSkipLoginSessionRedirect({ signedOutFlag: true, accessToken: "tok" }),
    true,
  );
  assert.equal(
    shouldSkipLoginSessionRedirect({ signedOutFlag: false, accessToken: "" }),
    true,
  );
});

test("login page still redirects when a browser session exists", () => {
  assert.equal(
    shouldSkipLoginSessionRedirect({ signedOutFlag: false, accessToken: "tok" }),
    false,
  );
});
