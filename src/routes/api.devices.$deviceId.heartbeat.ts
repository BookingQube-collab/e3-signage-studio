import { createFileRoute } from "@tanstack/react-router";

import { bearerToken, fromJsonResult, optionsResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/$deviceId/heartbeat")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request, params }) => {
        const { consumeRateLimit } = await import("@/server/rate-limit.server");
        const { deviceHeartbeat, handleDeviceJson } = await import("@/server/devices.server");
        const { rateLimitedResult } = await import("@/server/http/device-response");
        const limited = await consumeRateLimit("heartbeat", [params.deviceId]);
        if (!limited.allowed) {
          return rateLimitedResult("Too many heartbeats. Retry shortly.", limited.retryAfterSeconds);
        }
        const result = await handleDeviceJson(async () =>
          deviceHeartbeat(params.deviceId, bearerToken(request), await readJsonBody(request)),
        );
        return fromJsonResult(result);
      },
    },
  },
});
