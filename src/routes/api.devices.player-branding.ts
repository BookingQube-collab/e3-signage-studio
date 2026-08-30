import { createFileRoute } from "@tanstack/react-router";

import { fromJsonResult, optionsResult, rateLimitedResult } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/player-branding")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      GET: async ({ request }) => {
        const { consumeRateLimit, requestIp } = await import("@/server/rate-limit.server");
        const limited = await consumeRateLimit("playerBranding", [requestIp(request)]);
        if (!limited.allowed) {
          return rateLimitedResult(
            "Too many branding requests. Retry shortly.",
            limited.retryAfterSeconds,
          );
        }
        try {
          const { getPublicPlayerBranding } = await import("@/server/settings.server");
          const branding = await getPublicPlayerBranding();
          return fromJsonResult(
            { status: 200, body: branding },
            { "cache-control": "public, max-age=60" },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not load player branding.";
          return fromJsonResult(
            { status: 500, body: { error: message } },
            { "cache-control": "no-store" },
          );
        }
      },
    },
  },
});
