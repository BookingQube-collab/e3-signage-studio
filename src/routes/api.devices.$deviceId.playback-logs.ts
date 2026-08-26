import { createFileRoute } from "@tanstack/react-router";

import { bearerToken, fromJsonResult, optionsResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/$deviceId/playback-logs")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request, params }) => {
        const { devicePlaybackLogs, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () =>
          devicePlaybackLogs(params.deviceId, bearerToken(request), await readJsonBody(request)),
        );
        return fromJsonResult(result);
      },
    },
  },
});
