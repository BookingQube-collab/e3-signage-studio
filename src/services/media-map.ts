import { invert, UI_LABELS } from "@e3/shared-types";
import type { MediaType as CanonicalMediaType, MediaStatus } from "@e3/shared-types";

import type { Media, MediaFolder } from "@/types";

export const MEDIA_TYPE_FROM_UI = invert(UI_LABELS.mediaType);

export type MediaFolderRecord = {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
  archivedAt?: string | null;
};

export type MediaRecord = {
  id: string;
  filename: string;
  type: CanonicalMediaType;
  mimeType: string;
  status: MediaStatus;
  dimensions: string;
  durationSec: number | null;
  sizeMb: number;
  modifiedAt: string;
  uploadedBy: string;
  uploadedAt: string;
  version: string;
  thumbnailHue: number;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  folderId: string | null;
  folderName: string | null;
  usedIn: { playlists: string[]; campaigns: string[]; screens: string[] };
};

export function toUiFolder(row: MediaFolderRecord): MediaFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    fileCount: row.fileCount,
    archivedAt: row.archivedAt ?? null,
  };
}

function mediaTypeLabel(type: CanonicalMediaType | undefined): Media["type"] {
  const label = type ? UI_LABELS.mediaType[type] : undefined;
  return label === "Video" ||
    label === "Image" ||
    label === "QR" ||
    label === "Logo" ||
    label === "Audio"
    ? label
    : "Image";
}

export function toUiMedia(row: MediaRecord): Media {
  const media: Media = {
    id: row.id,
    filename: row.filename,
    type: mediaTypeLabel(row.type),
    dimensions: row.dimensions,
    durationSec: row.durationSec,
    sizeMb: row.sizeMb,
    modifiedAt: row.modifiedAt,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    version: row.version,
    thumbnailHue: row.thumbnailHue,
    folderId: row.folderId,
    folderName: row.folderName,
    usedIn: row.usedIn,
  };
  if (row.thumbnailUrl) media.thumbnailUrl = row.thumbnailUrl;
  if (row.previewUrl) media.previewUrl = row.previewUrl;
  return media;
}
