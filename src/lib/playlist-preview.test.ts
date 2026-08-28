import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_FADE_MS,
  asTransition,
  bindPreviewClips,
  elapsedOffsetForMedia,
  firstHttpUrl,
  previewFrameAt,
  previewLayerStyle,
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

test("incoming Fade plays in the first PREVIEW_FADE_MS of a clip", () => {
  const atFade = previewFrameAt(twoItems, 10_000 + PREVIEW_FADE_MS / 2);
  assert.equal(atFade?.index, 1);
  assert.equal(atFade?.prevIndex, 0);
  assert.equal(atFade?.effect, "Fade");
  assert.ok((atFade?.progress ?? 0) > 0.4 && (atFade?.progress ?? 0) < 0.6);

  const cutSolo = previewFrameAt([{ durationSec: 10, transition: "Cut" }], 250);
  assert.equal(cutSolo?.progress, 1);
  assert.equal(cutSolo?.effect, "Cut");
});

test("Cut / Fade / Slide follow the incoming item, not overlay-only labels", () => {
  const mixed = [
    { durationSec: 10, transition: "Cut" as const },
    { durationSec: 10, transition: "Slide" as const },
  ];
  const midSlide = previewFrameAt(mixed, 10_000 + PREVIEW_FADE_MS / 2);
  assert.equal(midSlide?.index, 1);
  assert.equal(midSlide?.prevIndex, 0);
  assert.equal(midSlide?.effect, "Slide");
  assert.ok((midSlide?.progress ?? 0) > 0.4 && (midSlide?.progress ?? 0) < 0.6);

  const afterSlide = previewFrameAt(mixed, 10_000 + PREVIEW_FADE_MS + 50);
  assert.equal(afterSlide?.index, 1);
  assert.equal(afterSlide?.progress, 1);

  const cutIn = previewFrameAt(
    [
      { durationSec: 10, transition: "Fade" },
      { durationSec: 10, transition: "Cut" },
    ],
    10_250,
  );
  assert.equal(cutIn?.index, 1);
  assert.equal(cutIn?.effect, "Cut");
  assert.equal(cutIn?.progress, 1);
});

test("asTransition keeps published enum values and new directions", () => {
  assert.equal(asTransition("CUT"), "Cut");
  assert.equal(asTransition("FADE"), "Fade");
  assert.equal(asTransition("SLIDE"), "Slide");
  assert.equal(asTransition("SLIDE_RIGHT"), "Slide right");
  assert.equal(asTransition("SLIDE_UP"), "Slide up");
  assert.equal(asTransition("WIPE"), "Wipe");
  assert.equal(asTransition("DISSOLVE"), "Dissolve");
  assert.equal(asTransition("ZOOM"), "Zoom");
  assert.equal(asTransition("NONE"), "None");
  assert.equal(asTransition("Cut"), "Cut");
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

test("previewLayerStyle actually moves and fades layers", () => {
  const fadeIn = previewLayerStyle("current", "Fade", 0.5);
  const fadeOut = previewLayerStyle("previous", "Fade", 0.5);
  assert.equal(fadeIn.opacity, "0.5");
  assert.equal(fadeOut.opacity, "0.5");

  const slideIn = previewLayerStyle("current", "Slide", 0);
  const slidePrev = previewLayerStyle("previous", "Slide", 0);
  assert.match(slideIn.transform ?? "", /translateX\(100%\)/);
  assert.match(slidePrev.transform ?? "", /translateX\(0%\)/);

  const rightIn = previewLayerStyle("current", "Slide right", 0);
  assert.match(rightIn.transform ?? "", /translateX\(-100%\)/);

  const upIn = previewLayerStyle("current", "Slide up", 0);
  assert.match(upIn.transform ?? "", /translateY\(100%\)/);

  const zoomIn = previewLayerStyle("current", "Zoom", 0);
  assert.match(zoomIn.transform ?? "", /scale\(/);
  assert.equal(zoomIn.opacity, "0");

  const wipeIn = previewLayerStyle("current", "Wipe", 0.5);
  assert.match(wipeIn.clipPath ?? "", /inset\(0 50% 0 0\)/);

  const dissolve = previewLayerStyle("previous", "Dissolve", 0.5);
  assert.match(dissolve.filter ?? "", /blur\(/);

  const cut = previewLayerStyle("current", "Cut", 0);
  assert.equal(cut.opacity, "1");
});

test("playable preview URLs allow https and blob, never storage keys", () => {
  assert.equal(firstHttpUrl("org/media/clip.mp4"), null);
  assert.equal(firstHttpUrl("https://cdn.example/clip.mp4"), "https://cdn.example/clip.mp4");
  assert.equal(firstHttpUrl("blob:https://cms.example/abc"), "blob:https://cms.example/abc");
});

test("bindPreviewClips uses signed library video URLs", () => {
  const clips = bindPreviewClips(
    [
      {
        id: "1",
        mediaId: "m2",
        filename: "WhatsApp Video.mp4",
        type: "Video",
        durationSec: 55,
        transition: "Cut",
      },
    ],
    new Map([
      ["m2", { previewUrl: "https://signed.example/whatsapp.mp4", type: "Video" }],
    ]),
  );
  assert.equal(clips[0]?.kind, "video");
  assert.equal(clips[0]?.previewUrl, "https://signed.example/whatsapp.mp4");
});
