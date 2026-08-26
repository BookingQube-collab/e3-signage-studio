import { createFileRoute } from "@tanstack/react-router";

import { bearerToken, fromJsonResult, optionsResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/$deviceId/error-logs")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request, params }) => {
        const { deviceErrorLogs, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () =>
          deviceErrorLogs(params.deviceId, bearerToken(request), await readJsonBody(request)),
        );
        return fromJsonResult(result);
      },
    },
  },
});
