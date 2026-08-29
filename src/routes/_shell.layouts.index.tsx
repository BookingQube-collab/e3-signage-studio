import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate, Plus } from "lucide-react";

import {
  E3Button,
  E3EmptyState,
  E3PageHeader,
  E3QueryBoundary,
} from "@/components/e3";
import { prefetchNavRoute } from "@/lib/nav-prefetch";
import { hasQueryClientContext } from "@/lib/router-preload";
import { layoutService } from "@/services";
import type { Layout } from "@/types";

export const Route = createFileRoute("/_shell/layouts/")({
  loader: ({ context }) => {
    if (typeof window === "undefined" || !hasQueryClientContext(context)) return;
    prefetchNavRoute(context.queryClient, "/layouts");
  },
  head: () => ({
    meta: [
      { title: "Layouts — E3 Digital Signage" },
      {
        name: "description",
        content: "Multi-zone screen layouts combining video, images, QR codes and live data.",
      },
      { property: "og:title", content: "Layouts — E3 Digital Signage" },
      {
        property: "og:description",
        content: "Multi-zone screen layouts combining video, images, QR codes and live data.",
      },
    ],
  }),
  component: LayoutsPage,
});

function layoutZones(layout: Layout) {
  return Array.isArray(layout.zones) ? layout.zones : [];
}

function LayoutsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["layouts"],
    queryFn: layoutService.list,
    throwOnError: false,
  });

  const layouts = Array.isArray(data) ? data : [];

  return (
    <div>
      <E3PageHeader
        title="Layouts"
        description="Zone templates for screens showing more than one piece of content."
        actions={
          <E3Button variant="primary" asChild>
            <Link to="/layouts/new">
              <Plus /> New layout
            </Link>
          </E3Button>
        }
      />

      <E3QueryBoundary isLoading={isLoading} isError={isError} refetch={() => void refetch()}>
        {layouts.length === 0 ? (
          <E3EmptyState
            icon={LayoutTemplate}
            title="No layouts yet"
            description="Create a zone template to combine video with promos and QR codes."
            action={
              <E3Button variant="primary" asChild>
                <Link to="/layouts/new">
                  <Plus /> New layout
                </Link>
              </E3Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {layouts.map((l) => {
              const zones = layoutZones(l);
              return (
                <Link
                  key={l.id}
                  to="/layouts/$id"
                  params={{ id: l.id }}
                  className="rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-e3-purple/40"
                >
                  <div
                    className="relative w-full overflow-hidden rounded-xl border border-border"
                    style={{
                      aspectRatio: l.orientation === "Portrait" ? "9 / 16" : "16 / 9",
                      background: l.background || "#19161A",
                    }}
                  >
                    {zones.map((z, index) => (
                      <div
                        key={z.id || `zone-${index}`}
                        className="absolute grid place-items-center border border-white/10 text-[10px] uppercase tracking-widest text-muted-foreground"
                        style={{
                          left: `${z.x ?? 0}%`,
                          top: `${z.y ?? 0}%`,
                          width: `${z.width ?? 100}%`,
                          height: `${z.height ?? 100}%`,
                          background: z.background,
                        }}
                      >
                        <span className="truncate px-1">{z.contentType}</span>
                      </div>
                    ))}
                  </div>
                  <h3 className="font-display mt-3 truncate text-base font-semibold">{l.name || "Untitled"}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.preset} · {l.resolution} · {zones.length} zones · {l.usedByScreens ?? 0} screens
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </E3QueryBoundary>
    </div>
  );
}
