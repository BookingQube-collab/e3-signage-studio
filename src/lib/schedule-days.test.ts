import assert from "node:assert/strict";
import test from "node:test";

import { daysToNumbers, numbersToDays, uiTime } from "./schedule-days.ts";
import { canonicalPriorityToUi, pickWinningSchedule, uiPriorityToCanonical } from "../server/priority.ts";

test("maps weekday labels to Postgres days_of_week", () => {
  assert.deepEqual(daysToNumbers(["Mon", "Wed", "Fri"]), [1, 3, 5]);
  assert.deepEqual(numbersToDays([0, 6]), ["Sun", "Sat"]);
});

test("formats Postgres times for the wizard", () => {
  assert.equal(uiTime("12:00:00"), "12:00");
  assert.equal(uiTime("08:30"), "08:30");
});

test("converts wizard priority 1 (highest) to canonical 100", () => {
  assert.equal(uiPriorityToCanonical(1), 100);
  assert.equal(uiPriorityToCanonical(10), 10);
  assert.equal(canonicalPriorityToUi(100), 1);
  assert.equal(canonicalPriorityToUi(50), 6);
});

test("emergency flag beats higher numeric priority", () => {
  const winner = pickWinningSchedule([
    {
      campaignId: "normal",
      emergency: false,
      priority: 100,
      startAt: new Date("2026-08-01T00:00:00Z"),
      createdAt: new Date("2026-08-01T00:00:00Z"),
    },
    {
      campaignId: "emergency",
      emergency: true,
      priority: 10,
      startAt: new Date("2026-07-01T00:00:00Z"),
      createdAt: new Date("2026-07-01T00:00:00Z"),
    },
  ]);
  assert.equal(winner?.campaignId, "emergency");
});
