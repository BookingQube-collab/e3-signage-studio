import { createFileRoute } from "@tanstack/react-router";

import { fromJsonResult, optionsResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/pair")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request }) => {
        const { handleDeviceJson, pairDevice } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () => pairDevice(await readJsonBody(request)));
        return fromJsonResult(result);
      },
    },
  },
});
