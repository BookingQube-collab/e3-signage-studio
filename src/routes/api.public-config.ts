import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public-config")({
  server: {
    handlers: {
      GET: async () => {
        const { getPublicSupabaseConfig, primeNitroRuntimeConfig } = await import(
          "@/server/env.server"
        );
        await primeNitroRuntimeConfig();
        const config = getPublicSupabaseConfig();
        if (!config) {
          return Response.json(
            { error: "Supabase is not configured on the server." },
            {
              status: 503,
              headers: { "cache-control": "no-store" },
            },
          );
        }
        return Response.json(config, {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
