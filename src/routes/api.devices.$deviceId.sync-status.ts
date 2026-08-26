import { createFileRoute } from "@tanstack/react-router";

import { bearerToken, fromJsonResult, optionsResult } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/$deviceId/sync-status")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      GET: async ({ request, params }) => {
        const { deviceSyncStatus, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () =>
          deviceSyncStatus(params.deviceId, bearerToken(request)),
        );
        return fromJsonResult(result);
      },
    },
  },
});
