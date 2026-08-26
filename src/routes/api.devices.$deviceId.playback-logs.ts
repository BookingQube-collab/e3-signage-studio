import { createFileRoute } from "@tanstack/react-router";

import { bearerToken, fromJsonResult, optionsResult, rateLimitedResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/$deviceId/playback-logs")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request, params }) => {
        const { consumeRateLimit } = await import("@/server/rate-limit.server");
        const limited = await consumeRateLimit("playback", [params.deviceId]);
        if (!limited.allowed) {
          return rateLimitedResult("Too many playback uploads. Retry shortly.", limited.retryAfterSeconds);
        }
        const { devicePlaybackLogs, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () =>
          devicePlaybackLogs(params.deviceId, bearerToken(request), await readJsonBody(request)),
        );
        return fromJsonResult(result);
      },
    },
  },
});
