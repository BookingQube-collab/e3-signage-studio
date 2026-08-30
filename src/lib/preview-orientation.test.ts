import assert from "node:assert/strict";
import test from "node:test";

import {
  isPreviewPortrait,
  isPreviewUpsideDown,
  previewAspectRatio,
  resolveCampaignPreviewOrientation,
} from "./preview-orientation.ts";

test("UI and canonical portrait labels are portrait", () => {
  assert.equal(isPreviewPortrait("Portrait"), true);
  assert.equal(isPreviewPortrait("Portrait (upside down)"), true);
  assert.equal(isPreviewPortrait("PORTRAIT"), true);
  assert.equal(isPreviewPortrait("PORTRAIT_UPSIDE_DOWN"), true);
  assert.equal(isPreviewPortrait("Landscape"), false);
  assert.equal(isPreviewPortrait("Landscape (upside down)"), false);
});

test("aspect ratio follows portrait vs landscape", () => {
  assert.equal(previewAspectRatio("Portrait"), "9 / 16");
  assert.equal(previewAspectRatio("Portrait (upside down)"), "9 / 16");
  assert.equal(previewAspectRatio("Landscape"), "16 / 9");
  assert.equal(previewAspectRatio("Landscape (upside down)"), "16 / 9");
  assert.equal(previewAspectRatio(undefined), "16 / 9");
});

test("upside-down detection", () => {
  assert.equal(isPreviewUpsideDown("Portrait (upside down)"), true);
  assert.equal(isPreviewUpsideDown("LANDSCAPE_UPSIDE_DOWN"), true);
  assert.equal(isPreviewUpsideDown("Portrait"), false);
});

test("campaign resolve prefers any portrait among selected screens", () => {
  assert.equal(
    resolveCampaignPreviewOrientation(["Landscape", "Portrait"]),
    "Portrait",
  );
  assert.equal(
    resolveCampaignPreviewOrientation(["Landscape (upside down)", "Portrait (upside down)"]),
    "Portrait (upside down)",
  );
  assert.equal(
    resolveCampaignPreviewOrientation(["Landscape", "Landscape (upside down)"]),
    "Landscape",
  );
  assert.equal(
    resolveCampaignPreviewOrientation([], "Portrait"),
    "Portrait",
  );
  assert.equal(resolveCampaignPreviewOrientation([]), "Landscape");
});
