import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaTypeFromName,
  playsByLocation,
  playsByMediaType,
  playsByWeekday,
  topContent,
  uptimeByLocation,
} from "./report-breakdowns.ts";
import type { AvailabilityRow, ProofOfPlayRow } from "../types/index.ts";

const rows: ProofOfPlayRow[] = [
  {
    id: "1",
    date: "2026-08-24", // Monday
    location: "InflataPark",
    screen: "Lobby",
    campaign: "Launch",
    playlist: "A",
    media: "Welcome.mp4",
    playCount: 10,
    totalDurationMin: 5,
    successRate: 100,
  },
  {
    id: "2",
    date: "2026-08-25", // Tuesday
    location: "InflataPark",
    screen: "Lobby",
    campaign: "Launch",
    playlist: "A",
    media: "poster.jpeg",
    playCount: 4,
    totalDurationMin: 2,
    successRate: 75,
  },
  {
    id: "3",
    date: "2026-08-24",
    location: "Downtown",
    screen: "Window",
    campaign: "—",
    playlist: "B",
    media: "loop.webm",
    playCount: 2,
    totalDurationMin: 1,
    successRate: 50,
  },
];

test("media type is inferred from extension", () => {
  assert.equal(mediaTypeFromName("Welcome.mp4"), "Video");
  assert.equal(mediaTypeFromName("poster.JPEG"), "Image");
  assert.equal(mediaTypeFromName("guide.pdf"), "Document");
  assert.equal(mediaTypeFromName("noext"), "Other");
});

test("plays by location sums play counts", () => {
  const byLoc = playsByLocation(rows);
  assert.equal(byLoc[0]?.name, "InflataPark");
  assert.equal(byLoc[0]?.value, 14);
  assert.equal(byLoc[1]?.name, "Downtown");
  assert.equal(byLoc[1]?.value, 2);
});

test("plays by media type groups video and image", () => {
  const byType = playsByMediaType(rows);
  const video = byType.find((r) => r.name === "Video");
  const image = byType.find((r) => r.name === "Image");
  assert.equal(video?.value, 12);
  assert.equal(image?.value, 4);
});

test("weekday distribution uses UTC calendar days", () => {
  const days = playsByWeekday(rows);
  assert.equal(days.find((d) => d.name === "Mon")?.value, 12);
  assert.equal(days.find((d) => d.name === "Tue")?.value, 4);
});

test("top content ranks by plays", () => {
  const top = topContent(rows, 2);
  assert.equal(top[0]?.media, "Welcome.mp4");
  assert.equal(top[0]?.plays, 10);
});

test("uptime by location averages screens", () => {
  const avail: AvailabilityRow[] = [
    {
      screenId: "a",
      screen: "Lobby",
      location: "InflataPark",
      onlinePct: 80,
      offlinePct: 20,
      lastSeen: "now",
    },
    {
      screenId: "b",
      screen: "Bar",
      location: "InflataPark",
      onlinePct: 40,
      offlinePct: 60,
      lastSeen: "now",
    },
  ];
  const byLoc = uptimeByLocation(avail);
  assert.equal(byLoc[0]?.name, "InflataPark");
  assert.equal(byLoc[0]?.value, 60);
  assert.equal(byLoc[0]?.screens, 2);
});
