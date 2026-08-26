import { MEDIA_TYPES, type MediaType } from "../../packages/shared-types/src/enums.ts";

export type ManifestAssetDraft = {
  mediaId: string;
  mediaVersionId: string;
  checksumSha256: string;
  fileSize: number;
  localFilename: string;
  assetType: MediaType;
};

export type ReadyMediaRow = {
  id: string;
  name: string;
  type: string;
  currentVersionId: string | null;
  status: string;
};

export type MediaVersionRow = {
  id: string;
  checksumSha256: string;
  sizeBytes: number;
};

function isMediaType(value: string): value is MediaType {
  return (MEDIA_TYPES as readonly string[]).includes(value);
}

/** Unique READY current versions only — one row per media id. */
export function toManifestAssets(
  mediaRows: ReadyMediaRow[],
  versions: MediaVersionRow[],
): ManifestAssetDraft[] {
  const versionById = new Map(versions.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const assets: ManifestAssetDraft[] = [];
  for (const row of mediaRows) {
    if (row.status !== "READY" || !row.currentVersionId) continue;
    if (seen.has(row.id)) continue;
    const version = versionById.get(row.currentVersionId);
    if (!version) continue;
    seen.add(row.id);
    assets.push({
      mediaId: row.id,
      mediaVersionId: row.currentVersionId,
      checksumSha256: version.checksumSha256,
      fileSize: version.sizeBytes,
      localFilename: row.name || row.id,
      assetType: isMediaType(row.type) ? row.type : "IMAGE",
    });
  }
  return assets;
}
