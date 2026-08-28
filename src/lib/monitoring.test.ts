import assert from "node:assert/strict";
import test from "node:test";

import {
  activityFromMonitoring,
  ADMIN_MONITORING_REFETCH_MS,
  adminMonitoringRefetchInterval,
  aggregateCampaignPerformance,
  aggregateProofOfPlay,
  availabilityFromHeartbeats,
  coveragePercent,
  deriveAlerts,
  expectedHeartbeats,
  isCloudStorageAlert,
  isStorageAlert,
  mergeDeviceLogLines,
  storageAlertCount,
  summarizeDashboardFleet,
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

test("device disk warning still uses 85 percent for screen detail helpers", () => {
  assert.equal(isStorageAlert(54.4, 64), true);
  assert.equal(isStorageAlert(50, 64), false);
  assert.equal(isStorageAlert(10, 0), false);
});

test("cloud storage alert fires at quota (8 GiB), not 85 percent", () => {
  assert.equal(isCloudStorageAlert(7.9, 8), false);
  assert.equal(isCloudStorageAlert(8, 8), true);
  assert.equal(isCloudStorageAlert(0.012, 8), false);
  assert.equal(isCloudStorageAlert(12, 8), true);
  assert.equal(isCloudStorageAlert(10, 0), false);
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
  assert.equal(alerts.some((a) => a.title === "Screen storage low"), false);
  assert.equal(alerts.some((a) => a.title === "Synchronization in progress"), true);
  assert.equal(alerts.some((a) => a.detail.includes("Lobby")), false);
  assert.equal(
    storageAlertCount([
      screen({ id: "s4", name: "Bar", storageUsedGb: 58, storageTotalGb: 64 }),
      screen({ id: "s1", name: "Office" }),
    ]),
    0,
  );
});

test("cloud storage low alert is labeled Cloudflare R2; Storage Alerts ignore device disk", () => {
  const alerts = deriveAlerts([], "just now", { usedGb: 8, totalGb: 8 });
  assert.equal(alerts[0]?.title, "Storage low");
  assert.match(alerts[0]?.detail ?? "", /Cloudflare R2/);
  assert.equal(storageAlertCount([screen({ id: "s1", name: "Office" })], { usedGb: 8, totalGb: 8 }), 1);
  assert.equal(storageAlertCount([screen({ id: "s1", name: "Office" })], { usedGb: 0.012, totalGb: 8 }), 0);
  assert.equal(
    storageAlertCount(
      [screen({ id: "s4", name: "Bar", storageUsedGb: 207.2, storageTotalGb: 238.2 })],
      { usedGb: 0.012, totalGb: 8 },
    ),
    0,
  );
  assert.equal(
    deriveAlerts(
      [screen({ id: "s4", name: "Rajan Room", storageUsedGb: 207.2, storageTotalGb: 238.2 })],
      "just now",
      { usedGb: 0.012, totalGb: 8 },
    ).some((a) => a.title === "Screen storage low" || a.title === "Storage low"),
    false,
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

test("dashboard fleet summary ignores archived locations and defers empty now-playing", () => {
  const summary = summarizeDashboardFleet({
    locations: [
      { id: "l1", name: "InflataPark", status: "Active" },
      { id: "l2", name: "Old hall", status: "Archived" },
    ],
    screens: [
      {
        ...screen({ id: "s1", name: "Office", status: "online" }),
        locationId: "l1",
        nowPlaying: "Welcome loop",
      },
      {
        ...screen({ id: "s2", name: "Lobby", status: "offline", lastSeen: "8 minutes ago" }),
        locationId: "l1",
        nowPlaying: null,
      },
    ],
  });
  assert.equal(summary.locations, 1);
  assert.equal(summary.screens, 2);
  assert.equal(summary.online, 1);
  assert.equal(summary.offline, 1);
  assert.equal(summary.locationStatus[0]?.online, 1);
  assert.equal(summary.nowPlaying[0]?.nowPlaying, "Welcome loop");
  assert.equal(summary.alerts[0]?.title, "Screen offline");
});

test("monitoring poll interval stays 30s when the document is not hidden", () => {
  assert.equal(adminMonitoringRefetchInterval(), ADMIN_MONITORING_REFETCH_MS);
});
