import { useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { clearSessionFn, persistSessionFn } from "@/lib/auth-functions";
import { getSupabase, isSupabaseBrowserConfigured } from "@/lib/supabase";

/** Keeps httpOnly auth cookies in sync with the browser Supabase session. */
export function AuthSessionSync({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseBrowserConfigured()) return undefined;

    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
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
        void persistSessionFn({
          data: {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          },
        }).catch(() => undefined);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  return children;
}
