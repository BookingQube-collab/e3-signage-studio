import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";

import { PermissionDenied } from "@/components/auth/PermissionDenied";
import { AppShell } from "@/components/layout/AppShell";
import { getAuthSessionFn } from "@/lib/auth-functions";
import { canAccessPath } from "@/lib/rbac";
import { getBrowserAccessToken } from "@/lib/supabase";

export const Route = createFileRoute("/_shell")({
  beforeLoad: async () => {
    const accessToken = await getBrowserAccessToken();
    const auth = await getAuthSessionFn({ data: { accessToken } });
    if (!auth.ok && auth.code === "UNAUTHENTICATED") {
      throw redirect({ to: "/login" });
    }
    return { auth };
  },
  component: ShellLayout,
});

function ShellLayout() {
  const { auth } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!auth) return null;
  const profile = auth.ok ? auth.profile : null;
  const allowed = auth.ok && canAccessPath(auth.profile.role, pathname);

  return (
    <AppShell profile={profile} fallbackEmail={auth.email}>
      {auth.ok ? (
        allowed ? (
          <Outlet />
        ) : (
          <PermissionDenied
            title="Permission denied"
            description="Your role does not include this page. Ask a Super Admin if you need access."
          />
        )
      ) : (
        <PermissionDenied
          title={
            auth.code === "NO_PROFILE"
              ? "No CMS profile"
              : auth.code === "DISABLED"
                ? "Account disabled"
                : "Unable to load session"
          }
          description={auth.message}
        />
      )}
    </AppShell>
  );
}
