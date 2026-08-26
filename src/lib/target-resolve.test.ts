import assert from "node:assert/strict";
import test from "node:test";

import { campaignIdsTargetingScreen, resolveTargetScreenIds } from "./target-resolve.ts";

const screens = [
  {
    id: "s1",
    locationId: "loc-a",
    organizationId: "org-1",
    operationalStatus: "READY",
    archivedAt: null,
  },
  {
    id: "s2",
    locationId: "loc-a",
    organizationId: "org-1",
    operationalStatus: "DISABLED",
    archivedAt: null,
  },
  {
    id: "s3",
    locationId: "loc-b",
    organizationId: "org-1",
    operationalStatus: "READY",
    archivedAt: null,
  },
];

const groups = [{ id: "g1", screenIds: ["s1", "s3"] }];

test("expands location, group, and org targets and skips disabled screens", () => {
  assert.deepEqual(
    resolveTargetScreenIds([{ type: "LOCATION", targetId: "loc-a" }], screens, groups).sort(),
    ["s1"],
  );
  assert.deepEqual(
    resolveTargetScreenIds([{ type: "SCREEN_GROUP", targetId: "g1" }], screens, groups).sort(),
    ["s1", "s3"],
  );
  assert.deepEqual(
    resolveTargetScreenIds([{ type: "ORGANIZATION", targetId: "org-1" }], screens, groups).sort(),
    ["s1", "s3"],
  );
  assert.deepEqual(
    resolveTargetScreenIds([{ type: "ORGANIZATION", targetId: null }], screens, groups).sort(),
    ["s1", "s3"],
  );
  assert.deepEqual(resolveTargetScreenIds([{ type: "SCREEN", targetId: "s2" }], screens, groups), []);
});

test("offline screens still receive the campaign independently of disabled ones", () => {
  const mixed = [
    ...screens,
    {
      id: "s4",
      locationId: "loc-b",
      organizationId: "org-1",
      operationalStatus: "ERROR",
      archivedAt: null,
    },
  ];
  assert.deepEqual(
    resolveTargetScreenIds([{ type: "ORGANIZATION", targetId: "org-1" }], mixed, groups).sort(),
    ["s1", "s3", "s4"],
  );
});

test("finds campaigns that include a screen via any target type", () => {
  const ids = campaignIdsTargetingScreen(
    screens[0]!,
    [
      { campaignId: "c-screen", type: "SCREEN", targetId: "s1" },
      { campaignId: "c-loc", type: "LOCATION", targetId: "loc-a" },
      { campaignId: "c-group", type: "SCREEN_GROUP", targetId: "g1" },
      { campaignId: "c-other", type: "SCREEN", targetId: "s3" },
    ],
    groups,
  );
  assert.deepEqual(ids.sort(), ["c-group", "c-loc", "c-screen"]);
});
