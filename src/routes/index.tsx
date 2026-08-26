import { createFileRoute, redirect } from "@tanstack/react-router";

import { getAuthSessionFn } from "@/lib/auth-functions";
import { getBrowserAccessToken } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const accessToken = await getBrowserAccessToken();
    const auth = await getAuthSessionFn({ data: { accessToken } });
    if (!auth.ok && auth.code === "UNAUTHENTICATED") {
      throw redirect({ to: "/login" });
    }
    throw redirect({ to: "/dashboard" });
  },
});
