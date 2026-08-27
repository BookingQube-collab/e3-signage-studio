import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";

import { PermissionDenied } from "@/components/auth/PermissionDenied";
import { AppShell } from "@/components/layout/AppShell";
import { AUTH_SESSION_STALE_MS, loadShellAuth } from "@/lib/query-defaults";
import { canAccessPath } from "@/lib/rbac";

export const Route = createFileRoute("/_shell")({
  // Keep sidebar+header mounted; don't re-hit auth on every sidebar click.
  staleTime: AUTH_SESSION_STALE_MS,
  preloadStaleTime: AUTH_SESSION_STALE_MS,
  shouldReload: false,
  beforeLoad: async ({ context }) => {
    const auth = await loadShellAuth(context.queryClient);
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
