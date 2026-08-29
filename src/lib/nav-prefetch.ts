import type { QueryClient } from "@tanstack/react-query";

import { hasQueryClientContext } from "@/lib/router-preload";

type NavPath =
  | "/dashboard"
  | "/locations"
  | "/screens"
  | "/media"
  | "/playlists"
  | "/layouts"
  | "/campaigns"
  | "/schedule"
  | "/reports"
  | "/users"
  | "/settings";

/**
 * Start list queries as soon as the user aims at a sidebar link.
 * Route `preload="intent"` only fetches the lazy chunk + beforeLoad;
 * without this, first click still waits on a cold server fn after mount.
 */
export function prefetchNavRoute(queryClient: QueryClient, to: NavPath): void {
  if (typeof window === "undefined") return;

  switch (to) {
    case "/dashboard":
      void import("@/services/dashboard").then(({ liveDashboardService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["dashboard"],
          queryFn: liveDashboardService.summary,
        });
      });
      return;
    case "/locations":
      void import("@/services/locations").then(({ liveLocationService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["locations"],
          queryFn: liveLocationService.list,
        });
      });
      return;
    case "/screens":
      void Promise.all([
        import("@/services/screens"),
        import("@/services/locations"),
        import("@/services/screen-groups"),
      ]).then(([{ liveScreenService }, { liveLocationService }, { liveScreenGroupService }]) => {
        void queryClient.prefetchQuery({
          queryKey: ["screens"],
          queryFn: liveScreenService.list,
        });
        void queryClient.prefetchQuery({
          queryKey: ["locations"],
          queryFn: liveLocationService.list,
        });
        void queryClient.prefetchQuery({
          queryKey: ["screen-groups"],
          queryFn: liveScreenGroupService.list,
        });
      });
      return;
    case "/media":
      void import("@/services/media").then(({ liveMediaService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["media"],
          queryFn: liveMediaService.list,
        });
        void queryClient.prefetchQuery({
          queryKey: ["media-folders"],
          queryFn: liveMediaService.listFolders,
        });
        void queryClient.prefetchQuery({
          queryKey: ["media-storage-backend"],
          queryFn: liveMediaService.storageBackend,
        });
      });
      return;
    case "/playlists":
      void import("@/services/playlists").then(({ livePlaylistService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["playlists"],
          queryFn: livePlaylistService.list,
        });
      });
      return;
    case "/layouts":
      void import("@/services/layouts").then(({ liveLayoutService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["layouts"],
          queryFn: liveLayoutService.list,
        });
      });
      return;
    case "/campaigns":
      void Promise.all([import("@/services/campaigns"), import("@/services/locations")]).then(
        ([{ liveCampaignService }, { liveLocationService }]) => {
          void queryClient.prefetchQuery({
            queryKey: ["campaigns"],
            queryFn: liveCampaignService.list,
          });
          void queryClient.prefetchQuery({
            queryKey: ["locations"],
            queryFn: liveLocationService.list,
          });
        },
      );
      return;
    case "/schedule":
      void import("@/services/schedules").then(({ liveScheduleService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["schedule"],
          queryFn: liveScheduleService.list,
        });
      });
      return;
    case "/reports":
      void import("@/services/reports").then(({ liveReportService }) => {
        void queryClient.prefetchQuery({
          queryKey: ["report-pop"],
          queryFn: liveReportService.proofOfPlay,
        });
        void queryClient.prefetchQuery({
          queryKey: ["report-avail"],
          queryFn: liveReportService.availability,
        });
        void queryClient.prefetchQuery({
          queryKey: ["report-perf"],
          queryFn: liveReportService.campaignPerformance,
        });
      });
      return;
    case "/users":
      void Promise.all([import("@/services/users"), import("@/lib/auth-functions"), import("@/lib/supabase")]).then(
        ([{ liveUserService }, { listLocationOptionsFn }, { getBrowserAccessToken }]) => {
          void queryClient.prefetchQuery({
            queryKey: ["users"],
            queryFn: liveUserService.list,
          });
          void queryClient.prefetchQuery({
            queryKey: ["users", "location-options"],
            queryFn: async () => {
              const accessToken = await getBrowserAccessToken();
              return listLocationOptionsFn({ data: { accessToken } });
            },
          });
        },
      );
      return;
    case "/settings":
      void Promise.all([
        import("@/lib/settings-functions"),
        import("@/lib/supabase"),
      ]).then(([{ getOrganizationSettingsFn }, { getBrowserAccessToken }]) => {
        void queryClient.prefetchQuery({
          queryKey: ["organization-settings"],
          queryFn: async () => {
            const accessToken = await getBrowserAccessToken();
            return getOrganizationSettingsFn({ data: { accessToken } });
          },
        });
      });
      return;
    default:
      return;
  }
}

/** Non-blocking list loaders for TanStack intent preload (after the route chunk lands). */
export function shellListLoader(
  prefetch: (queryClient: QueryClient) => void,
): (opts: { context: { queryClient?: QueryClient } }) => void {
  return ({ context }) => {
    if (typeof window === "undefined") return;
    if (!hasQueryClientContext(context)) return;
    prefetch(context.queryClient);
  };
}
