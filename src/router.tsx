import { createRouter } from "@tanstack/react-router";

import { RoutePending } from "@/components/layout/RoutePending";
import { AUTH_SESSION_STALE_MS, createAppQueryClient } from "@/lib/query-defaults";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultStaleTime: AUTH_SESSION_STALE_MS,
    defaultPreloadStaleTime: AUTH_SESSION_STALE_MS,
    defaultPendingMs: 200,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
