import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/branding")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getPublicBranding } = await import("@/server/settings.server");
          const branding = await getPublicBranding();
          return Response.json(branding, {
            headers: { "cache-control": "public, max-age=60" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not load branding.";
          return Response.json(
            { error: message },
            { status: 500, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
