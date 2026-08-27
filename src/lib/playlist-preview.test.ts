import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_FADE_MS,
  bindPreviewClips,
  elapsedOffsetForMedia,
  previewFrameAt,
} from "./playlist-preview.ts";

const twoItems = [
  { durationSec: 10, transition: "Fade" as const },
  { durationSec: 10, transition: "Fade" as const },
];

test("preview plays items in order then loops", () => {
  assert.equal(previewFrameAt(twoItems, 0)?.index, 0);
  assert.equal(previewFrameAt(twoItems, 9_000)?.index, 0);
  assert.equal(previewFrameAt(twoItems, 10_000)?.index, 1);
  assert.equal(previewFrameAt(twoItems, 19_500)?.index, 1);
  assert.equal(previewFrameAt(twoItems, 20_000)?.index, 0);
  assert.equal(previewFrameAt(twoItems, 20_000)?.nextIndex, 1);
});

test("preview honors each item duration", () => {
  const mixed = [
    { durationSec: 5, transition: "Cut" as const },
    { durationSec: 15, transition: "Fade" as const },
  ];
  assert.equal(previewFrameAt(mixed, 4_999)?.index, 0);
  assert.equal(previewFrameAt(mixed, 5_000)?.index, 1);
  assert.equal(previewFrameAt(mixed, 19_999)?.index, 1);
  assert.equal(previewFrameAt(mixed, 20_000)?.index, 0);
});

test("fade begins in the last PREVIEW_FADE_MS of a clip", () => {
  const atFade = previewFrameAt(twoItems, 10_000 - PREVIEW_FADE_MS / 2);
  assert.equal(atFade?.index, 0);
  assert.equal(atFade?.nextIndex, 1);
  assert.ok((atFade?.fadeT ?? 0) > 0.4 && (atFade?.fadeT ?? 0) < 0.6);

  const cut = previewFrameAt([{ durationSec: 10, transition: "Cut" }], 9_750);
  assert.equal(cut?.fadeT, 0);
});

test("bindPreviewClips uses library preview URLs in playlist order", () => {
  const clips = bindPreviewClips(
    [
      {
        id: "1",
        mediaId: "m1",
        filename: "rajan.jpeg",
        type: "Image",
        durationSec: 10,
        transition: "Fade",
      },
      {
        id: "2",
        mediaId: "m2",
        filename: "wireframe.png",
        type: "Image",
        durationSec: 10,
        transition: "Fade",
      },
    ],
    new Map([
      ["m1", { previewUrl: "https://cdn.example/rajan.jpeg", type: "Image" }],
      ["m2", { thumbnailUrl: "https://cdn.example/wireframe.png", type: "Image" }],
    ]),
  );
  assert.deepEqual(
    clips.map((clip) => clip.previewUrl),
    ["https://cdn.example/rajan.jpeg", "https://cdn.example/wireframe.png"],
  );
  assert.deepEqual(
    clips.map((clip) => clip.thumbnailUrl),
    ["https://cdn.example/rajan.jpeg", "https://cdn.example/wireframe.png"],
  );
  assert.equal(elapsedOffsetForMedia(clips, "m2"), 10_000);
});

test("bindPreviewClips ignores storage keys and uses playlist-signed URLs", () => {
  const clips = bindPreviewClips(
    [
      {
        id: "1",
        mediaId: "m1",
        filename: "ninjago-welcome-special-day.jpg",
        type: "Image",
        durationSec: 10,
        transition: "Fade",
        previewUrl: "https://signed.example/welcome.jpg",
        thumbnailUrl: "https://signed.example/welcome.jpg",
      },
      {
        id: "2",
        mediaId: "m2",
        filename: "clip.mp4",
        type: "Video",
        durationSec: 8,
        transition: "Cut",
        previewUrl: "https://signed.example/clip.mp4",
        thumbnailUrl: "https://signed.example/clip-poster.jpg",
      },
    ],
    new Map([
      ["m1", { previewUrl: "org/media/welcome.jpg", thumbnailUrl: "org/media/welcome.jpg", type: "Image" }],
      ["m2", { type: "Video" }],
    ]),
  );
  assert.equal(clips[0]?.kind, "image");
  assert.equal(clips[0]?.previewUrl, "https://signed.example/welcome.jpg");
  assert.equal(clips[1]?.kind, "video");
  assert.equal(clips[1]?.previewUrl, "https://signed.example/clip.mp4");
  assert.equal(clips[1]?.thumbnailUrl, "https://signed.example/clip-poster.jpg");
});
