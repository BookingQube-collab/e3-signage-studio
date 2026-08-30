import { invert, UI_LABELS } from "@e3/shared-types";
import type { MediaType, PlaylistStatus, Transition } from "@e3/shared-types";

import { UI_TRANSITIONS, type Playlist } from "@/types";

export const PLAYLIST_STATUS_FROM_UI = invert(UI_LABELS.playlistStatus);
export const TRANSITION_FROM_UI = invert(UI_LABELS.transition);

export type PlaylistItemRecord = {
  id: string;
  mediaId: string;
  filename: string;
  type: MediaType;
  durationSec: number;
  transition: Transition;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  audioMediaId?: string | null;
  audioFilename?: string | null;
  audioUrl?: string | null;
};

export type PlaylistRecord = {
  id: string;
  name: string;
  status: PlaylistStatus;
  items: PlaylistItemRecord[];
  usedByScreens: number;
  modifiedAt: string;
};

function playlistStatusLabel(status: PlaylistStatus | undefined): Playlist["status"] {
  const label = status ? UI_LABELS.playlistStatus[status] : undefined;
  return label === "Draft" || label === "Active" || label === "Scheduled" || label === "Archived"
    ? label
    : "Draft";
}

function mediaTypeLabel(type: MediaType | undefined): Playlist["items"][number]["type"] {
  const label = type ? UI_LABELS.mediaType[type] : undefined;
  return label === "Video" || label === "Image" || label === "QR" || label === "Logo" || label === "Audio"
    ? label
    : "Image";
}

export function toUiPlaylist(row: PlaylistRecord): Playlist {
  const items = Array.isArray(row?.items) ? row.items : [];
  return {
    id: typeof row?.id === "string" ? row.id : "",
    name: typeof row?.name === "string" ? row.name : "",
    status: playlistStatusLabel(row?.status),
    items: items.map((item) => {
      const transitionLabel = item?.transition ? UI_LABELS.transition[item.transition] : undefined;
      const transition = (UI_TRANSITIONS as readonly string[]).includes(transitionLabel ?? "")
        ? (transitionLabel as Playlist["items"][number]["transition"])
        : "Fade";
      const mapped: Playlist["items"][number] = {
        id: typeof item?.id === "string" ? item.id : "",
        mediaId: typeof item?.mediaId === "string" ? item.mediaId : "",
        filename: typeof item?.filename === "string" ? item.filename : "Untitled",
        type: mediaTypeLabel(item?.type),
        durationSec: Number.isFinite(item?.durationSec) ? Math.max(1, item.durationSec) : 1,
        transition,
      };
      if (item?.thumbnailUrl) mapped.thumbnailUrl = item.thumbnailUrl;
      if (item?.previewUrl) mapped.previewUrl = item.previewUrl;
      if (item?.audioMediaId) mapped.audioMediaId = item.audioMediaId;
      if (item?.audioFilename) mapped.audioFilename = item.audioFilename;
      if (item?.audioUrl) mapped.audioUrl = item.audioUrl;
      return mapped;
    }),
    usedByScreens: Number.isFinite(row?.usedByScreens) ? row.usedByScreens : 0,
    modifiedAt: typeof row?.modifiedAt === "string" ? row.modifiedAt : "",
  };
}
