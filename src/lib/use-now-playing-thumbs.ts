import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { uniqueNowPlayingMediaIds, withNowPlayingThumbnails } from "@/lib/now-playing-thumbs";
import { screenService } from "@/services";
import type { Screen } from "@/types";

/** Hydrate Screens card posters after the fast list paints. */
export function useNowPlayingThumbnails(screens: Screen[], enabled = true) {
  const mediaIds = useMemo(() => uniqueNowPlayingMediaIds(screens), [screens]);

  const thumbsQuery = useQuery({
    queryKey: ["screens", "now-playing-thumbs", mediaIds],
    queryFn: () => screenService.nowPlayingThumbnails(mediaIds),
    enabled: enabled && mediaIds.length > 0,
    staleTime: 60_000,
  });

  const screensWithThumbs = useMemo(
    () => withNowPlayingThumbnails(screens, thumbsQuery.data),
    [screens, thumbsQuery.data],
  );

  return { screens: screensWithThumbs, thumbsQuery };
}
