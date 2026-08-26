import { createFileRoute } from "@tanstack/react-router";

import { fromJsonResult, optionsResult, readJsonBody } from "@/server/http/device-response";

export const Route = createFileRoute("/api/devices/activate")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request }) => {
        const { activateDevice, handleDeviceJson } = await import("@/server/devices.server");
        const result = await handleDeviceJson(async () => activateDevice(await readJsonBody(request)));
        return fromJsonResult(result);
      },
    },
  },
});
