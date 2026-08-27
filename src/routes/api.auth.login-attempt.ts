import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { fromJsonResult, optionsResult, readJsonBody } from "@/server/http/device-response";

const bodySchema = z.object({
  email: z.string().optional(),
  identifier: z.string().optional(),
});

export const Route = createFileRoute("/api/auth/login-attempt")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResult(),
      POST: async ({ request }) => {
        let identity = "";
        try {
          const parsed = bodySchema.safeParse(await readJsonBody(request));
          identity = parsed.success
            ? (parsed.data.identifier ?? parsed.data.email ?? "").trim()
            : "";
        } catch {
          identity = "";
        }
        const { consumeRateLimit, hashLoginIdentity, requestIp } = await import(
          "@/server/rate-limit.server"
        );
        const decision = await consumeRateLimit("login", [
          requestIp(request),
          hashLoginIdentity(identity),
        ]);
        if (!decision.allowed) {
          return fromJsonResult(
            { status: 429, body: { error: "Too many sign-in attempts. Try again in a few minutes." } },
            { "Retry-After": String(decision.retryAfterSeconds || 60) },
          );
        }
        return fromJsonResult({ status: 200, body: { ok: true } });
      },
    },
  },
});
