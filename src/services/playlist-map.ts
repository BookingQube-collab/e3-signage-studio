import { invert, UI_LABELS } from "@e3/shared-types";
import type { MediaType, PlaylistStatus, Transition } from "@e3/shared-types";

import type { Playlist } from "@/types";

export const PLAYLIST_STATUS_FROM_UI = invert(UI_LABELS.playlistStatus);
export const TRANSITION_FROM_UI = invert(UI_LABELS.transition);

export type PlaylistItemRecord = {
  id: string;
  mediaId: string;
  filename: string;
  type: MediaType;
  durationSec: number;
  transition: Transition;
};

export type PlaylistRecord = {
  id: string;
  name: string;
  status: PlaylistStatus;
  items: PlaylistItemRecord[];
  usedByScreens: number;
  modifiedAt: string;
};

export function toUiPlaylist(row: PlaylistRecord): Playlist {
  return {
    id: row.id,
    name: row.name,
    status: UI_LABELS.playlistStatus[row.status],
    items: row.items.map((item) => {
      const transitionLabel = UI_LABELS.transition[item.transition];
      const transition =
        transitionLabel === "Cut" || transitionLabel === "Fade" || transitionLabel === "Slide"
          ? transitionLabel
          : "Fade";
      return {
        id: item.id,
        mediaId: item.mediaId,
        filename: item.filename,
        type: UI_LABELS.mediaType[item.type],
        durationSec: item.durationSec,
        transition,
      };
    }),
    usedByScreens: row.usedByScreens,
    modifiedAt: row.modifiedAt,
  };
}
