import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLayoutResolution,
  percentToPx,
  toDeviceLayoutJson,
  zonePercentForDb,
} from "./layout-pixels.ts";

test("converts zone percents to canvas pixels", () => {
  assert.equal(percentToPx(70, 1920), 1344);
  assert.equal(percentToPx(100, 1080), 1080);
  assert.equal(percentToPx(0, 1920), 0);
});

test("parses Lovable resolution strings", () => {
  assert.deepEqual(parseLayoutResolution("1920 × 1080", "LANDSCAPE"), {
    widthPx: 1920,
    heightPx: 1080,
  });
  assert.deepEqual(parseLayoutResolution("1080 × 1920", "PORTRAIT"), {
    widthPx: 1080,
    heightPx: 1920,
  });
});

test("builds device JSON with pixel boxes while keeping zone ids", () => {
  const json = toDeviceLayoutJson({
    widthPx: 1920,
    heightPx: 1080,
    orientation: "LANDSCAPE",
    background: "#19161A",
    zones: [
      {
        id: "zone-1",
        name: "Video",
        type: "VIDEO",
        xPercent: 0,
        yPercent: 0,
        widthPercent: 70,
        heightPercent: 100,
        fit: "COVER",
        contentRef: "media-1",
        background: "#252229",
        durationSeconds: 15,
      },
    ],
  });
  assert.equal(json.zones[0]?.width, 1344);
  assert.equal(json.zones[0]?.height, 1080);
  assert.equal(json.zones[0]?.id, "zone-1");
});

test("clamps zero-width zones for the percent check constraint", () => {
  assert.equal(zonePercentForDb(0, { min: 0.1 }), 0.1);
  assert.equal(zonePercentForDb(150, { min: 0.1 }), 100);
});
