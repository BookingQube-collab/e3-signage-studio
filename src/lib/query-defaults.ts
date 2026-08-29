import { QueryClient } from "@tanstack/react-query";

import type { AuthSessionResult } from "@/lib/auth-types";

/** Reuse list data when switching sidebar tabs so pages don't flash-refetch. */
export const ADMIN_QUERY_STALE_MS = 90_000;
export const ADMIN_QUERY_GC_MS = 10 * 60_000;

/** Skip the shell auth round-trip when the session was just resolved. */
export const AUTH_SESSION_STALE_MS = ADMIN_QUERY_STALE_MS;
export const AUTH_SESSION_QUERY_KEY = ["auth-session"] as const;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ADMIN_QUERY_STALE_MS,
        gcTime: ADMIN_QUERY_GC_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // Show cached lists immediately; only refetch when staleTime elapsed.
        refetchOnMount: true,
        refetchIntervalInBackground: false,
        retry: 1,
      },
    },
  });
}

export async function loadShellAuth(
  queryClient: QueryClient,
  fetchAuth: () => Promise<AuthSessionResult> = fetchAuthSession,
): Promise<AuthSessionResult> {
  return queryClient.ensureQueryData({
    queryKey: [...AUTH_SESSION_QUERY_KEY],
    staleTime: AUTH_SESSION_STALE_MS,
    queryFn: fetchAuth,
  });
}

export function clearShellAuth(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: [...AUTH_SESSION_QUERY_KEY] });
}

async function fetchAuthSession(): Promise<AuthSessionResult> {
  const { getAuthSessionFn } = await import("@/lib/auth-functions");
  const { getBrowserAccessToken } = await import("@/lib/supabase");
  const accessToken = await getBrowserAccessToken();
  return getAuthSessionFn({ data: { accessToken } });
}
