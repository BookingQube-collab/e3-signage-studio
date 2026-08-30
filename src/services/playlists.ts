import { archivePlaylistFn, getPlaylistFn, listPlaylistsFn, savePlaylistFn } from "@/lib/content-functions";
import { getBrowserAccessToken } from "@/lib/supabase";
import type { Playlist } from "@/types";
import { PLAYLIST_STATUS_FROM_UI, TRANSITION_FROM_UI, toUiPlaylist } from "./playlist-map";
import type { PlaylistService } from "./types";

async function accessToken(): Promise<string> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error("Sign in to continue.");
  return token;
}

export const livePlaylistService: PlaylistService = {
  list: async () => {
    const rows = await listPlaylistsFn({ data: { accessToken: await accessToken() } });
    return (Array.isArray(rows) ? rows : []).map((row) => toUiPlaylist(row));
  },
  get: async (id) => {
    const row = await getPlaylistFn({ data: { accessToken: await accessToken(), id } });
    return row ? toUiPlaylist(row) : null;
  },
  save: async (playlist: Playlist) => {
    const status = PLAYLIST_STATUS_FROM_UI[playlist.status];
    if (!status) throw new Error("Invalid playlist status.");
    const items = (playlist.items ?? []).map((item) => {
      const transition = TRANSITION_FROM_UI[item.transition];
      if (!transition) throw new Error(`Unsupported transition: ${item.transition}`);
      return {
        id: item.id,
        mediaId: item.mediaId,
        durationSec: item.durationSec,
        transition,
        audioMediaId: item.type === "Image" && item.audioMediaId ? item.audioMediaId : null,
      };
    });
    const row = await savePlaylistFn({
      data: {
        accessToken: await accessToken(),
        id: playlist.id,
        name: playlist.name,
        status,
        items,
      },
    });
    return toUiPlaylist(row);
  },
  remove: async (id) => archivePlaylistFn({ data: { accessToken: await accessToken(), id } }),
};
