import assert from "node:assert/strict";
import test from "node:test";

import { MEDIA_TYPES } from "../../packages/shared-types/src/enums.ts";
import { invert, UI_LABELS } from "../../packages/shared-types/src/ui-labels.ts";

test("every canonical media type has a UI label including AUDIO", () => {
  for (const type of MEDIA_TYPES) {
    assert.equal(typeof UI_LABELS.mediaType[type], "string");
    assert.ok(UI_LABELS.mediaType[type].length > 0);
  }
  assert.equal(UI_LABELS.mediaType.AUDIO, "Audio");
  assert.equal(UI_LABELS.mediaType.IMAGE, "Image");
  assert.equal(UI_LABELS.mediaType.VIDEO, "Video");
});

test("UI media type invert round-trips AUDIO for library mapping", () => {
  const fromUi = invert(UI_LABELS.mediaType);
  assert.equal(fromUi.Audio, "AUDIO");
  assert.equal(fromUi.Image, "IMAGE");
  assert.equal(fromUi.Video, "VIDEO");
});

/** Keep in sync with iconFor keys in E3MediaCard — missing Audio crashed /media. */
test("media library icon coverage list includes every UI media label", () => {
  const iconKeys = new Set(["Video", "Image", "QR", "Logo", "Audio"]);
  for (const label of Object.values(UI_LABELS.mediaType)) {
    assert.ok(iconKeys.has(label), `media thumb icon missing for ${label}`);
  }
});
