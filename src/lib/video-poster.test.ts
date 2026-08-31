import assert from "node:assert/strict";
import test from "node:test";

import {
  isImageStillUrl,
  seekVideoToClipLoopStart,
  seekVideoToStillFrame,
  videoClipLoopWindow,
  videoPreviewNeedsHydration,
  videoStillNeedsHydration,
} from "./video-poster.ts";

test("images never need video still hydration", () => {
  assert.equal(
    videoStillNeedsHydration({
      type: "Image",
      previewUrl: "https://cdn.example/a.jpg",
    }),
    false,
  );
});

test("videos without a signed poster or preview need hydration", () => {
  assert.equal(videoStillNeedsHydration({ type: "Video" }), false);
  assert.equal(
    videoStillNeedsHydration({ type: "Video", thumbnailUrl: "not-a-url", previewUrl: "" }),
    false,
  );
});

test("videos still need a signed preview URL even when a poster exists", () => {
  assert.equal(videoPreviewNeedsHydration({ type: "Image" }), false);
  assert.equal(videoPreviewNeedsHydration({ type: "Video" }), true);
  assert.equal(
    videoPreviewNeedsHydration({
      type: "Video",
      previewUrl: "https://cdn.example/clip.mp4",
    }),
    false,
  );
});

test("videos with a poster or preview already have a still source", () => {
  assert.equal(
    videoStillNeedsHydration({
      type: "Video",
      thumbnailUrl: "https://cdn.example/poster.jpg",
    }),
    false,
  );
  assert.equal(
    videoStillNeedsHydration({
      type: "Video",
      previewUrl: "https://cdn.example/clip.mp4",
    }),
    false,
  );
});

test("isImageStillUrl only treats image files as posters", () => {
  assert.equal(isImageStillUrl("https://cdn.example/poster.jpg"), true);
  assert.equal(isImageStillUrl("https://cdn.example/clip.mp4?token=1"), false);
  assert.equal(isImageStillUrl("blob:https://e3-cms.vercel.app/abc"), false);
});

test("seekVideoToStillFrame pauses and seeks ~2.5s for a useful still", () => {
  const video = {
    readyState: 1,
    duration: 55,
    currentTime: 0,
    pause() {
      this.paused = true;
    },
    paused: false,
  };
  seekVideoToStillFrame(video);
  assert.equal(video.paused, true);
  assert.equal(video.currentTime, 2.5);
});

test("seekVideoToStillFrame clamps to short clip duration", () => {
  const video = {
    readyState: 1,
    duration: 1.2,
    currentTime: 0,
    pause() {},
  };
  seekVideoToStillFrame(video);
  assert.equal(video.currentTime, 1.15);
});

test("seekVideoToStillFrame is a no-op before metadata is available", () => {
  const video = {
    readyState: 0,
    duration: Number.NaN,
    currentTime: 0,
    pause() {
      throw new Error("should not pause");
    },
  };
  seekVideoToStillFrame(video);
  assert.equal(video.currentTime, 0);
});

test("videoClipLoopWindow uses a ~3s window from the still seek point", () => {
  assert.deepEqual(videoClipLoopWindow(60), { start: 2.5, end: 5.5 });
});

test("videoClipLoopWindow plays the full clip when shorter than the loop", () => {
  assert.deepEqual(videoClipLoopWindow(2), { start: 0, end: 1.95 });
});

test("seekVideoToClipLoopStart jumps to the loop window start", () => {
  const video = {
    readyState: 1,
    duration: 40,
    currentTime: 0,
  };
  seekVideoToClipLoopStart(video);
  assert.equal(video.currentTime, 2.5);
});
