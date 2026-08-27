import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignLifecycleStatus,
  effectiveCampaignStatus,
  formatCampaignDateTime,
  formatCampaignWindowLabel,
  isDatedSchedule,
  isEvergreenSchedule,
} from "./campaign-window.ts";
import { wallTimeToUtcMs } from "./zoned-time.ts";

const window = {
  startDate: "2026-08-26",
  endDate: "2026-08-26",
  startTime: "12:00",
  endTime: "22:00",
  timezone: "Asia/Qatar",
};

function at(time: string): number {
  return wallTimeToUtcMs("2026-08-26", time, "Asia/Qatar");
}

test("scheduled before start datetime, not just start date", () => {
  assert.equal(campaignLifecycleStatus(window, at("11:59")), "Scheduled");
});

test("active between start and end datetime", () => {
  assert.equal(campaignLifecycleStatus(window, at("12:00")), "Active");
  assert.equal(campaignLifecycleStatus(window, at("18:24")), "Active");
  assert.equal(campaignLifecycleStatus(window, at("22:00")), "Active");
});

test("ended after end datetime on the same calendar day", () => {
  assert.equal(campaignLifecycleStatus(window, at("22:01")), "Ended");
});

test("multi-day campaign stays active until end date+time", () => {
  const long = { ...window, endDate: "2026-12-31", endTime: "23:59" };
  assert.equal(campaignLifecycleStatus(long, at("23:30")), "Active");
  assert.equal(
    campaignLifecycleStatus(long, wallTimeToUtcMs("2027-01-01", "00:00", "Asia/Qatar")),
    "Ended",
  );
});

test("paused and draft stay frozen even after the window ends", () => {
  assert.equal(effectiveCampaignStatus("Paused", window, at("23:00")), "Paused");
  assert.equal(effectiveCampaignStatus("Draft", window, at("23:00")), "Draft");
  assert.equal(effectiveCampaignStatus("Archived", window, at("23:00")), "Archived");
});

test("stored active/scheduled become ended when the end time has passed", () => {
  assert.equal(effectiveCampaignStatus("Active", window, at("22:01")), "Ended");
  assert.equal(effectiveCampaignStatus("Scheduled", window, at("22:01")), "Ended");
  assert.equal(effectiveCampaignStatus("Active", window, at("11:00")), "Scheduled");
  assert.equal(effectiveCampaignStatus("Scheduled", window, at("15:00")), "Active");
});

test("formats start/end with hours and minutes in the campaign timezone", () => {
  const label = formatCampaignDateTime("2026-08-26", "12:00", "Asia/Qatar");
  assert.match(label, /26/);
  assert.match(label, /Aug/);
  assert.match(label, /2026/);
  assert.match(label, /12:00/);
});

const evergreen = {
  startDate: "",
  endDate: "",
  startTime: "12:00",
  endTime: "22:00",
  timezone: "Asia/Qatar",
};

test("null or empty dates are evergreen and in window", () => {
  assert.equal(isEvergreenSchedule({ startDate: "", endDate: "" }), true);
  assert.equal(isEvergreenSchedule({ startDate: "2026-08-26", endDate: "2026-08-26" }), false);
  assert.equal(isDatedSchedule(window), true);
  assert.equal(isDatedSchedule(evergreen), false);
  assert.equal(campaignLifecycleStatus(evergreen, at("11:59")), "Active");
  assert.equal(campaignLifecycleStatus(evergreen, at("23:00")), "Active");
  assert.equal(
    campaignLifecycleStatus(
      { ...evergreen, startDate: null as unknown as string, endDate: null as unknown as string },
      at("03:00"),
    ),
    "Active",
  );
  assert.equal(effectiveCampaignStatus("Active", evergreen, at("03:00")), "Active");
  assert.equal(effectiveCampaignStatus("Scheduled", evergreen, at("03:00")), "Active");
  assert.equal(formatCampaignWindowLabel(evergreen), "Ongoing");
});

test("missing dates are not expired or not-yet-started", () => {
  assert.notEqual(campaignLifecycleStatus(evergreen, at("23:00")), "Ended");
  assert.notEqual(campaignLifecycleStatus(evergreen, at("00:01")), "Scheduled");
});

test("start-only is open-ended after the start datetime", () => {
  const openEnded = { ...window, endDate: "" };
  assert.equal(campaignLifecycleStatus(openEnded, at("11:59")), "Scheduled");
  assert.equal(campaignLifecycleStatus(openEnded, at("12:00")), "Active");
  assert.equal(campaignLifecycleStatus(openEnded, wallTimeToUtcMs("2027-01-01", "00:00", "Asia/Qatar")), "Active");
});

test("listing helpers do not throw on missing schedule or bad timezone", () => {
  assert.equal(isDatedSchedule(undefined), false);
  assert.equal(isEvergreenSchedule(undefined), false);
  assert.equal(campaignLifecycleStatus(undefined, at("12:00")), "Scheduled");
  assert.equal(effectiveCampaignStatus("Active", undefined, at("12:00")), "Scheduled");
  assert.equal(formatCampaignWindowLabel(undefined), "—");
  assert.equal(Number.isFinite(wallTimeToUtcMs("2026-08-26", "12:00", "Qatar")), false);
  assert.equal(Number.isFinite(wallTimeToUtcMs("not-a-date", "12:00", "Asia/Qatar")), false);
  assert.equal(effectiveCampaignStatus("Active", { ...window, timezone: "Qatar" }, at("15:00")), "Scheduled");
  assert.equal(formatCampaignDateTime("2026-08-26", "12:00", "Qatar"), "2026-08-26 12:00");
});
