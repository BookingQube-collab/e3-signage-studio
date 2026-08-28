import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AuthSessionSync } from "@/lib/auth-sync";
import type { AuthSessionResult } from "@/lib/auth-types";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme";
import { useIsClient } from "@/lib/use-is-client";
import appCss from "../styles.css?url";
import { CmsFavicon } from "@/components/branding/CmsBranding";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display e3-gradient-text text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/dashboard"
            className="e3-gradient inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back to the dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="e3-gradient inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  auth?: AuthSessionResult;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "E3 Digital Signage — Content Management" },
      {
        name: "description",
        content:
          "E3 Digital Signage admin: manage screens, media, playlists, layouts, campaigns and sync across every location.",
      },
      { property: "og:title", content: "E3 Digital Signage — Content Management" },
      {
        property: "og:description",
        content: "Operational control for screens, campaigns and content across all E3 locations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preload",
        href: "/fonts/space-grotesk-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/rajdhani-600-latin.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // Default dark via blocking script + class; suppressHydrationWarning for theme class sync.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const Toaster = lazy(() =>
  import("@/components/ui/sonner").then((mod) => ({ default: mod.Toaster })),
);

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isClient = useIsClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthSessionSync>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          {isClient ? <CmsFavicon /> : null}
          {isClient ? (
            <Suspense fallback={null}>
              <Toaster position="top-right" richColors />
            </Suspense>
          ) : null}
        </AuthSessionSync>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
