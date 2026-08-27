import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSupabase } from "@/lib/supabase";

const TABLES = ["screens", "device_sync_states", "device_heartbeats", "sync_events"] as const;

/** Invalidate admin monitoring queries when device heartbeats or sync acks arrive. */
export function useLiveMonitoring(queryKeys: ReadonlyArray<readonly unknown[]>): void {
  const qc = useQueryClient();
  const keyFingerprint = queryKeys.map((key) => JSON.stringify(key)).join("|");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let supabase;
    try {
      supabase = getSupabase();
    } catch {
      return;
    }
    let active = true;
    const invalidate = () => {
      if (!active) return;
      for (const key of queryKeys) {
        void qc.invalidateQueries({ queryKey: [...key] });
      }
    };
    let channel = supabase.channel(`e3-admin-monitoring:${keyFingerprint}`);
    for (const table of TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        invalidate,
      );
    }
    channel.subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
    // queryKeys is captured via fingerprint so callers can pass inline arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, keyFingerprint]);
}
