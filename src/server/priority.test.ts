import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPriorityToUi,
  pickWinningSchedule,
  uiPriorityToCanonical,
  type ScheduleCandidate,
} from "./priority.ts";

function candidate(partial: Partial<ScheduleCandidate> & { campaignId: string }): ScheduleCandidate {
  return {
    emergency: false,
    priority: 50,
    startAt: new Date("2026-08-01T00:00:00Z"),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...partial,
  };
}

test("maps UI 1 (highest) to canonical 100 and back", () => {
  assert.equal(uiPriorityToCanonical(1), 100);
  assert.equal(uiPriorityToCanonical(10), 10);
  assert.equal(canonicalPriorityToUi(100), 1);
  assert.equal(canonicalPriorityToUi(50), 6);
});

test("emergency then higher priority then later start wins publish", () => {
  const normal = candidate({ campaignId: "normal", priority: 50 });
  const event = candidate({ campaignId: "event", priority: 80 });
  const emergency = candidate({
    campaignId: "alert",
    priority: 80,
    emergency: true,
    startAt: new Date("2026-08-01T00:00:00Z"),
  });
  assert.equal(pickWinningSchedule([normal, event, emergency])?.campaignId, "alert");
  assert.equal(pickWinningSchedule([normal, event])?.campaignId, "event");
  const earlier = candidate({ campaignId: "earlier", priority: 80, startAt: new Date("2026-08-01T00:00:00Z") });
  const later = candidate({ campaignId: "later", priority: 80, startAt: new Date("2026-08-20T00:00:00Z") });
  assert.equal(pickWinningSchedule([earlier, later])?.campaignId, "later");
});

test("empty candidate list has no winner", () => {
  assert.equal(pickWinningSchedule([]), null);
});
