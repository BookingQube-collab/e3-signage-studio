import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_LOCATION_ACCESS_MESSAGE,
  assertLocationAccess,
  assertScreenLocationAccess,
  campaignEditableByProfile,
  campaignVisibleToProfile,
  canAccessLocationId,
  contentVisibleToProfile,
  filterLocationsByScope,
  filterScreensByScope,
  isLocationScopedRole,
  isOrgWideRole,
  isProtectedSuperAdminEmail,
  locationIdsForNewMedia,
  mediaVisibleToProfile,
  requiresLocationAssignment,
} from "./location-scope.ts";

const locA = "11111111-1111-4111-8111-111111111111";
const locB = "22222222-2222-4222-8222-222222222222";
const locC = "33333333-3333-4333-8333-333333333333";

const superAdmin = {
  id: "admin-1",
  role: "SUPER_ADMIN" as const,
  locationIds: [] as string[],
};

const supervisor = {
  id: "sup-1",
  role: "SITE_SUPERVISOR" as const,
  locationIds: [locA, locB],
};

const locations = [
  { id: locA, name: "KDS" },
  { id: locB, name: "InflataPark" },
  { id: locC, name: "Urban Arena" },
];

const screens = [
  { id: "s-a", locationId: locA },
  { id: "s-b", locationId: locB },
  { id: "s-c", locationId: locC },
];

test("Site Supervisor sees only assigned locations; Super Admin sees all", () => {
  assert.equal(isOrgWideRole("SUPER_ADMIN"), true);
  assert.equal(isLocationScopedRole("SITE_SUPERVISOR"), true);
  assert.equal(requiresLocationAssignment("SITE_SUPERVISOR"), true);
  assert.equal(requiresLocationAssignment("SUPER_ADMIN"), false);

  assert.deepEqual(
    filterLocationsByScope(supervisor, locations).map((row) => row.id),
    [locA, locB],
  );
  assert.deepEqual(
    filterLocationsByScope(superAdmin, locations).map((row) => row.id),
    [locA, locB, locC],
  );
  assert.deepEqual(
    filterScreensByScope(supervisor, screens).map((row) => row.id),
    ["s-a", "s-b"],
  );
  assert.deepEqual(
    filterScreensByScope(superAdmin, screens).map((row) => row.id),
    ["s-a", "s-b", "s-c"],
  );
  assert.equal(canAccessLocationId(supervisor, locA), true);
  assert.equal(canAccessLocationId(supervisor, locC), false);
  assert.equal(canAccessLocationId(superAdmin, locC), true);
});

test("API rejects out-of-scope screen and campaign targets", () => {
  assert.throws(() => assertLocationAccess(supervisor, locC), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, NO_LOCATION_ACCESS_MESSAGE);
    return true;
  });
  assert.doesNotThrow(() => assertLocationAccess(supervisor, locA));
  assert.doesNotThrow(() => assertLocationAccess(superAdmin, locC));
  assert.doesNotThrow(() => assertScreenLocationAccess(supervisor, locA, "PERMANENT_FEC"));
  assert.throws(() => assertScreenLocationAccess(supervisor, locC, "PERMANENT_FEC"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, NO_LOCATION_ACCESS_MESSAGE);
    return true;
  });

  assert.equal(campaignVisibleToProfile(supervisor, [locA], "other"), true);
  assert.equal(campaignVisibleToProfile(supervisor, [locC], "other"), false);
  assert.equal(campaignVisibleToProfile(supervisor, [], supervisor.id), true);
  assert.equal(campaignVisibleToProfile(superAdmin, [locC], "other"), true);

  assert.equal(campaignEditableByProfile(supervisor, [locA, locB], "other"), true);
  assert.equal(campaignEditableByProfile(supervisor, [locA, locC], "other"), false);
  assert.throws(() => {
    if (!campaignEditableByProfile(supervisor, [locC], "other")) {
      throw new Error(NO_LOCATION_ACCESS_MESSAGE);
    }
  }, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, NO_LOCATION_ACCESS_MESSAGE);
    return true;
  });
});

test("Supervisor media is owned, tagged, or used at assigned locations", () => {
  assert.equal(
    mediaVisibleToProfile(
      supervisor,
      { createdBy: supervisor.id, uploadedBy: supervisor.id, locationIds: [] },
      false,
    ),
    true,
  );
  assert.equal(
    mediaVisibleToProfile(supervisor, { createdBy: "ops", locationIds: [locA] }, false),
    true,
  );
  assert.equal(
    mediaVisibleToProfile(supervisor, { createdBy: "ops", locationIds: [locC] }, false),
    false,
  );
  assert.equal(
    mediaVisibleToProfile(supervisor, { createdBy: "ops", locationIds: [] }, true),
    true,
  );
  assert.equal(
    mediaVisibleToProfile(superAdmin, { createdBy: "ops", locationIds: [locC] }, false),
    true,
  );
  assert.deepEqual(locationIdsForNewMedia(supervisor), [locA, locB]);
  assert.deepEqual(locationIdsForNewMedia(superAdmin), []);
  assert.equal(contentVisibleToProfile(supervisor, supervisor.id, false), true);
  assert.equal(contentVisibleToProfile(supervisor, "ops", false), false);
  assert.equal(contentVisibleToProfile(supervisor, "ops", true), true);
  assert.equal(isProtectedSuperAdminEmail("rajan@e3.qa"), true);
  assert.equal(isProtectedSuperAdminEmail("RAJAN@E3.QA"), true);
});
