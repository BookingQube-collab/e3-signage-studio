import assert from "node:assert/strict";
import test from "node:test";

import {
  activityFromMonitoring,
  aggregateCampaignPerformance,
  aggregateProofOfPlay,
  availabilityFromHeartbeats,
  coveragePercent,
  deriveAlerts,
  expectedHeartbeats,
  isStorageAlert,
  mergeDeviceLogLines,
  storageAlertCount,
  toCsv,
  type PlaybackEvent,
  type ScreenHealth,
} from "./monitoring.ts";

const NOW = Date.parse("2026-08-26T13:00:00.000Z");

function screen(patch: Partial<ScreenHealth> & Pick<ScreenHealth, "id" | "name">): ScreenHealth {
  return {
    locationName: "InflataPark",
    status: "online",
    syncState: "Ready",
    syncProgress: 100,
    lastSeen: "2 minutes ago",
    storageUsedGb: 10,
    storageTotalGb: 64,
    lastError: null,
    ...patch,
  };
}

test("expected heartbeats uses the 2-minute interval", () => {
  assert.equal(expectedHeartbeats(10 * 60 * 1000), 5);
  assert.equal(expectedHeartbeats(0), 0);
});

test("coverage never exceeds 100 percent", () => {
  assert.equal(coveragePercent(0, 10), 0);
  assert.equal(coveragePercent(5, 10), 50);
  assert.equal(coveragePercent(12, 10), 100);
  assert.equal(coveragePercent(3, 0), 100);
});

test("storage alert fires at 85 percent used", () => {
  assert.equal(isStorageAlert(54.4, 64), true);
  assert.equal(isStorageAlert(50, 64), false);
  assert.equal(isStorageAlert(10, 0), false);
});

test("offline screens become critical alerts; disabled screens do not", () => {
  const alerts = deriveAlerts([
    screen({ id: "s1", name: "Office", status: "offline", lastSeen: "8 minutes ago" }),
    screen({ id: "s2", name: "Lobby", status: "disabled" }),
    screen({
      id: "s3",
      name: "Cafe",
      status: "syncing",
      syncState: "Downloading",
      syncProgress: 42,
    }),
    screen({ id: "s4", name: "Bar", storageUsedGb: 58, storageTotalGb: 64 }),
    screen({ id: "s5", name: "Kiosk", syncState: "Failed", lastError: "checksum mismatch" }),
  ]);
  assert.equal(alerts[0]?.title, "Screen offline");
  assert.equal(alerts.some((a) => a.title === "Sync failed"), true);
  assert.equal(alerts.some((a) => a.title === "Storage low"), true);
  assert.equal(alerts.some((a) => a.title === "Synchronization in progress"), true);
  assert.equal(alerts.some((a) => a.detail.includes("Lobby")), false);
  assert.equal(
    storageAlertCount([
      screen({ id: "s4", name: "Bar", storageUsedGb: 58, storageTotalGb: 64 }),
      screen({ id: "s1", name: "Office" }),
    ]),
    1,
  );
});

test("activity prefers sync acks and unique offline rows", () => {
  const items = activityFromMonitoring(
    [
      {
        id: "e1",
        screenName: "Office",
        fromState: "READY",
        toState: "ACTIVE",
        detail: "Package ACTIVE",
        createdAt: "2026-08-26T12:50:00.000Z",
      },
      {
        id: "e2",
        screenName: "Office",
        fromState: "DOWNLOADING",
        toState: "FAILED",
        detail: "sha mismatch",
        createdAt: "2026-08-26T12:40:00.000Z",
      },
    ],
    [screen({ id: "s1", name: "Office", status: "offline", lastSeen: "6 minutes ago" })],
    NOW,
  );
  assert.equal(items.some((i) => i.message.includes("synchronized")), true);
  assert.equal(items.some((i) => i.kind === "offline"), true);
  assert.equal(items.filter((i) => i.kind === "offline").length, 1);
});

const plays: PlaybackEvent[] = [
  {
    id: "p1",
    startedAt: "2026-08-26T10:00:00.000Z",
    durationMs: 15_000,
    result: "COMPLETED",
    screenId: "s1",
    screenName: "Office",
    locationName: "InflataPark",
    campaignId: "c1",
    campaignName: "Launch",
    playlistId: "pl1",
    playlistName: "Loop A",
    mediaId: "m1",
    mediaName: "Welcome.mp4",
  },
  {
    id: "p2",
    startedAt: "2026-08-26T10:00:20.000Z",
    durationMs: 15_000,
    result: "ERROR",
    screenId: "s1",
    screenName: "Office",
    locationName: "InflataPark",
    campaignId: "c1",
    campaignName: "Launch",
    playlistId: "pl1",
    playlistName: "Loop A",
    mediaId: "m1",
    mediaName: "Welcome.mp4",
  },
];

test("proof of play groups by day, screen, and media", () => {
  const rows = aggregateProofOfPlay(plays);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.playCount, 2);
  assert.equal(rows[0]?.successRate, 50);
  assert.equal(rows[0]?.campaign, "Launch");
  assert.equal(rows[0]?.totalDurationMin, 1);
});

test("availability uses heartbeat coverage over the window", () => {
  const rows = availabilityFromHeartbeats(
    [
      {
        screenId: "s1",
        screenName: "Office",
        locationName: "InflataPark",
        heartbeatCount: 5,
        createdAtMs: NOW - 10 * 60 * 1000,
        lastHeartbeatAt: "2026-08-26T12:58:00.000Z",
      },
    ],
    NOW,
  );
  assert.equal(rows[0]?.onlinePct, 100);
  assert.equal(rows[0]?.offlinePct, 0);
});

test("campaign performance uses completion rate from playback results", () => {
  const rows = aggregateCampaignPerformance(plays, new Map([["c1", 3]]));
  assert.equal(rows[0]?.campaign, "Launch");
  assert.equal(rows[0]?.plays, 2);
  assert.equal(rows[0]?.screens, 3);
  assert.equal(rows[0]?.completionRate, 50);
});

test("device logs are newest first", () => {
  const lines = mergeDeviceLogLines([
    { id: "a", at: "2026-08-26T12:00:00.000Z", source: "heartbeat", message: "older" },
    { id: "b", at: "2026-08-26T12:10:00.000Z", source: "sync", message: "newer" },
  ]);
  assert.equal(lines[0]?.message, "newer");
  assert.equal(lines[0]?.source, "sync");
});

test("csv escapes commas and quotes", () => {
  const csv = toCsv(["Media", "Plays"], [["Welcome, \"loop\"", "12"]]);
  assert.equal(csv.includes('"Welcome, ""loop"""'), true);
});
