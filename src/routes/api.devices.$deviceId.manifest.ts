import { createFileRoute } from "@tanstack/react-router";

import { bearerToken, fromJsonResult, optionsResult } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/$deviceId/manifest")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      GET: async ({ request, params }) => {
        const { deviceManifest, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () =>
          deviceManifest(params.deviceId, bearerToken(request)),
        );
        return fromJsonResult(result);
      },
    },
  },
});
