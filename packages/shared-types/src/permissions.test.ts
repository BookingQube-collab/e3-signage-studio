import assert from "node:assert/strict";
import test from "node:test";

import { canAccessPath, hasPermission } from "./permissions.ts";

test("Super Admin has every permission used by the admin shell", () => {
  assert.equal(hasPermission("SUPER_ADMIN", "users.manage"), true);
  assert.equal(hasPermission("SUPER_ADMIN", "settings.manage"), true);
  assert.equal(canAccessPath("SUPER_ADMIN", "/users"), true);
  assert.equal(canAccessPath("SUPER_ADMIN", "/settings"), true);
});

test("Marketing can publish content but cannot open Users or Settings", () => {
  assert.equal(hasPermission("MARKETING", "campaigns.publish"), true);
  assert.equal(hasPermission("MARKETING", "media.manage"), true);
  assert.equal(hasPermission("MARKETING", "users.view"), false);
  assert.equal(hasPermission("MARKETING", "settings.view"), false);
  assert.equal(canAccessPath("MARKETING", "/campaigns/new"), true);
  assert.equal(canAccessPath("MARKETING", "/users"), false);
  assert.equal(canAccessPath("MARKETING", "/settings"), false);
});

test("Site Supervisor is limited to screens and schedules", () => {
  assert.equal(hasPermission("SITE_SUPERVISOR", "screens.manage"), true);
  assert.equal(hasPermission("SITE_SUPERVISOR", "schedule.manage"), true);
  assert.equal(hasPermission("SITE_SUPERVISOR", "media.manage"), false);
  assert.equal(canAccessPath("SITE_SUPERVISOR", "/screens/abc"), true);
  assert.equal(canAccessPath("SITE_SUPERVISOR", "/media"), false);
  assert.equal(canAccessPath("SITE_SUPERVISOR", "/users"), false);
});

test("Event Manager can run campaigns but not manage users", () => {
  assert.equal(hasPermission("EVENT_MANAGER", "campaigns.manage"), true);
  assert.equal(hasPermission("EVENT_MANAGER", "playlists.manage"), true);
  assert.equal(hasPermission("EVENT_MANAGER", "layouts.manage"), false);
  assert.equal(hasPermission("EVENT_MANAGER", "users.manage"), false);
  assert.equal(canAccessPath("EVENT_MANAGER", "/campaigns"), true);
  assert.equal(canAccessPath("EVENT_MANAGER", "/layouts"), true);
  assert.equal(canAccessPath("EVENT_MANAGER", "/users"), false);
});
