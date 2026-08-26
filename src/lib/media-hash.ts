import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

const CHUNK_SIZE = 4 * 1024 * 1024;

export async function sha256HexOfBlob(blob: Blob): Promise<string> {
  const hasher = sha256.create();
  const total = blob.size;
  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const slice = blob.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    const buffer = await slice.arrayBuffer();
    hasher.update(new Uint8Array(buffer));
  }
  return bytesToHex(hasher.digest());
}

export async function probeMediaDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null; durationMs: number | null }> {
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) {
    return probeImage(file);
  }
  if (file.type.startsWith("video/") || /\.mp4$/i.test(file.name)) {
    return probeVideo(file);
  }
  return { width: null, height: null, durationMs: null };
}

function probeImage(
  file: File,
): Promise<{ width: number | null; height: number | null; durationMs: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
        durationMs: null,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null, durationMs: null });
    };
    image.src = url;
  });
}

function probeVideo(
  file: File,
): Promise<{ width: number | null; height: number | null; durationMs: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const durationMs =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.round(video.duration * 1000)
          : null;
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationMs,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null, durationMs: null });
    };
    video.src = url;
  });
}
