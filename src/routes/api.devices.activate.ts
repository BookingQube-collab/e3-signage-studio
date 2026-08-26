import { createFileRoute } from "@tanstack/react-router";

import { fromJsonResult, optionsResult, rateLimitedResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/activate")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request }) => {
        const { consumeRateLimit, requestIp } = await import("@/server/rate-limit.server");
        const limited = await consumeRateLimit("activate", [requestIp(request)]);
        if (!limited.allowed) {
          return rateLimitedResult("Too many activate polls. Retry shortly.", limited.retryAfterSeconds);
        }
        const { activateDevice, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () => activateDevice(await readJsonBody(request)));
        return fromJsonResult(result);
      },
    },
  },
});
