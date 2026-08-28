import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { clearSessionFn, persistSessionFn } from "@/lib/auth-functions";
import { clearShellAuth } from "@/lib/query-defaults";
import { isSigningOut } from "@/lib/sign-out";
import { ensurePublicSupabaseConfig, getSupabase } from "@/lib/supabase";

/** Keeps httpOnly auth cookies in sync with the browser Supabase session. */
export function AuthSessionSync({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void ensurePublicSupabaseConfig().then((config) => {
      if (!config || cancelled) return;
      const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
        if (isSigningOut()) return;
        if (event === "SIGNED_OUT") {
          clearShellAuth(queryClient);
          void clearSessionFn()
            .then(async () => {
              await router.invalidate();
              if (router.state.location.pathname !== "/login") {
                await router.navigate({ to: "/login" });
              }
            })
            .catch(() => undefined);
          return;
        }
        if (
          session &&
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
        ) {
          if (event === "SIGNED_IN") {
            clearShellAuth(queryClient);
          }
          void persistSessionFn({
            data: {
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
            },
          }).catch(() => undefined);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [queryClient, router]);

  return children;
}
