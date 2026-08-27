import { createRouter } from "@tanstack/react-router";

import { AUTH_SESSION_STALE_MS, createAppQueryClient } from "@/lib/query-defaults";
import { routeTree } from "./routeTree.gen";

function RoutePending() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-10 max-w-sm animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

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
