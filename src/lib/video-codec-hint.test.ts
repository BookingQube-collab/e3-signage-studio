import assert from "node:assert/strict";
import test from "node:test";

import {
  assessTvVideoCompat,
  looksLikeWhatsAppVideoName,
  sniffMp4CodecFromBytes,
  tvVideoUploadWarning,
} from "./video-codec-hint.ts";

function asciiBox(fourcc: string, pad = 64): Uint8Array {
  const out = new Uint8Array(pad);
  for (let i = 0; i < fourcc.length; i++) out[8 + i] = fourcc.charCodeAt(i);
  return out;
}

test("sniff detects avc1 / hvc1 / vp09", () => {
  assert.equal(sniffMp4CodecFromBytes(asciiBox("avc1")), "avc1");
  assert.equal(sniffMp4CodecFromBytes(asciiBox("hvc1")), "hvc1");
  assert.equal(sniffMp4CodecFromBytes(asciiBox("vp09")), "vp09");
});

test("WhatsApp filename heuristic", () => {
  assert.equal(looksLikeWhatsAppVideoName("WhatsApp Video 2026-08-30 at 12.01.02.mp4"), true);
  assert.equal(looksLikeWhatsAppVideoName("lobby-loop.mp4"), false);
});

test("assessTvVideoCompat warns on HEVC bytes", async () => {
  const bytes = asciiBox("hvc1");
  const file = {
    name: "clip.mp4",
    type: "video/mp4",
    size: bytes.byteLength,
    slice: () => ({
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
  } as unknown as File;
  const compat = await assessTvVideoCompat(file);
  assert.equal(compat.status, "risky");
  if (compat.status === "risky") {
    assert.match(tvVideoUploadWarning(file.name, compat) ?? "", /HEVC|H\.265/);
  }
});

test("assessTvVideoCompat ok on avc1", async () => {
  const bytes = asciiBox("avc1");
  const file = {
    name: "lobby.mp4",
    type: "video/mp4",
    size: bytes.byteLength,
    slice: () => ({
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
  } as unknown as File;
  const compat = await assessTvVideoCompat(file);
  assert.equal(compat.status, "ok");
  assert.equal(tvVideoUploadWarning(file.name, compat), null);
});
