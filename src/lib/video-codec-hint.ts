/**
 * Lightweight MP4 codec sniff for TV signage compatibility hints.
 * Looks for common sample-entry / config fourccs in the first few MB.
 * Not a full demuxer — enough to warn on WhatsApp HEVC / VP9 / AV1.
 */

export type SniffedVideoCodec =
  | "avc1"
  | "hvc1"
  | "hev1"
  | "vp09"
  | "av01"
  | "unknown";

export type TvVideoCompat =
  | { status: "ok"; codec: "avc1" }
  | { status: "risky"; codec: SniffedVideoCodec; reason: string }
  | { status: "skip" };

const SNIFF_BYTES = 4 * 1024 * 1024;

function findAscii(haystack: Uint8Array, needle: string): boolean {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  const codes = Array.from(needle, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= haystack.length - codes.length; i++) {
    for (let j = 0; j < codes.length; j++) {
      if (haystack[i + j] !== codes[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function sniffMp4CodecFromBytes(bytes: Uint8Array): SniffedVideoCodec {
  // Prefer explicit HEVC / VP9 / AV1 markers before AVC (avcC often appears in HEVC files too? rare).
  if (findAscii(bytes, "hvc1") || findAscii(bytes, "hev1") || findAscii(bytes, "hvcC")) {
    return findAscii(bytes, "hev1") && !findAscii(bytes, "hvc1") ? "hev1" : "hvc1";
  }
  if (findAscii(bytes, "vp09") || findAscii(bytes, "vp08")) return "vp09";
  if (findAscii(bytes, "av01") || findAscii(bytes, "av1C")) return "av01";
  if (findAscii(bytes, "avc1") || findAscii(bytes, "avcC") || findAscii(bytes, "avc3")) return "avc1";
  return "unknown";
}

export function looksLikeWhatsAppVideoName(filename: string): boolean {
  return /whatsapp/i.test(filename);
}

export function describeRiskyVideoCodec(codec: SniffedVideoCodec): string {
  switch (codec) {
    case "hvc1":
    case "hev1":
      return "HEVC / H.265 — many signage TVs (including TCL) cannot decode it";
    case "vp09":
      return "VP9 — not reliably supported on Android TV signage SoCs";
    case "av01":
      return "AV1 — rarely supported on digital signage TVs";
    default:
      return "codec could not be confirmed as H.264";
  }
}

/**
 * Client-side TV compatibility check before / after selecting a video for upload.
 */
export async function assessTvVideoCompat(file: Pick<File, "name" | "type" | "size" | "slice">): Promise<TvVideoCompat> {
  const mime = (file.type || "").toLowerCase();
  const isVideo =
    mime.startsWith("video/") || /\.mp4$/i.test(file.name) || /\.webm$/i.test(file.name);
  if (!isVideo) return { status: "skip" };

  try {
    const end = Math.min(file.size, SNIFF_BYTES);
    const buf = new Uint8Array(await file.slice(0, end).arrayBuffer());
    const codec = sniffMp4CodecFromBytes(buf);
    if (codec === "avc1") return { status: "ok", codec: "avc1" };
    const whatsapp = looksLikeWhatsAppVideoName(file.name);
    const reason =
      codec === "unknown" && whatsapp
        ? "WhatsApp videos are often HEVC — re-export as H.264 MP4 for TCL / Android TV"
        : describeRiskyVideoCodec(codec);
    return { status: "risky", codec, reason };
  } catch {
    if (looksLikeWhatsAppVideoName(file.name)) {
      return {
        status: "risky",
        codec: "unknown",
        reason: "WhatsApp videos are often HEVC — re-export as H.264 MP4 for TCL / Android TV",
      };
    }
    return { status: "skip" };
  }
}

export function tvVideoUploadWarning(fileName: string, compat: TvVideoCompat): string | null {
  if (compat.status !== "risky") return null;
  return `“${fileName}” may not play on signage TVs (${compat.reason}). Prefer H.264 (AVC) + AAC stereo MP4.`;
}

/** Short Media Library banner copy. */
export const MEDIA_LIBRARY_CODEC_HINT =
  "TV playback: use H.264 (AVC) + AAC MP4. WhatsApp / phone HEVC clips often fail to decode on TCL and similar boxes — re-export before publishing.";
