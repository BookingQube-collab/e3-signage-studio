import { invert, UI_LABELS } from "@e3/shared-types";
import type { MediaType as CanonicalMediaType, MediaStatus } from "@e3/shared-types";

import type { Media } from "@/types";

export const MEDIA_TYPE_FROM_UI = invert(UI_LABELS.mediaType);

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
  usedIn: { playlists: string[]; campaigns: string[]; screens: string[] };
};

export function toUiMedia(row: MediaRecord): Media {
  const media: Media = {
    id: row.id,
    filename: row.filename,
    type: UI_LABELS.mediaType[row.type],
    dimensions: row.dimensions,
    durationSec: row.durationSec,
    sizeMb: row.sizeMb,
    modifiedAt: row.modifiedAt,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    version: row.version,
    thumbnailHue: row.thumbnailHue,
    usedIn: row.usedIn,
  };
  if (row.thumbnailUrl) media.thumbnailUrl = row.thumbnailUrl;
  if (row.previewUrl) media.previewUrl = row.previewUrl;
  return media;
}
