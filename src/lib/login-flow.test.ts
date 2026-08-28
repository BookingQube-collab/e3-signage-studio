import assert from "node:assert/strict";
import test from "node:test";

import { SYNTHETIC_LOGIN_DOMAIN } from "./user-credentials.ts";
import { emailAfterUsernameLookup, shouldSkipLoginSessionRedirect } from "./login-flow.ts";

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

test("username login falls back to the synthetic auth email if lookup times out", () => {
  assert.equal(emailAfterUsernameLookup("waqar"), `waqar@${SYNTHETIC_LOGIN_DOMAIN}`);
  assert.equal(emailAfterUsernameLookup("waqar", { email: "waqar@e3.qa" }), "waqar@e3.qa");
});
