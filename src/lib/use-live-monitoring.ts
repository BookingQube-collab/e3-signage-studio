import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSupabase } from "@/lib/supabase";

const TABLES = ["screens", "device_sync_states", "device_heartbeats", "sync_events"] as const;

/** Collapse bursty device events so list pages don't refetch on every heartbeat. */
const INVALIDATE_DEBOUNCE_MS = 2_500;

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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      debounceTimer = null;
      if (!active) return;
      if (document.visibilityState === "hidden") return;
      for (const key of queryKeys) {
        void qc.invalidateQueries({ queryKey: [...key] });
      }
    };
    const invalidate = () => {
      if (!active) return;
      if (document.visibilityState === "hidden") return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, INVALIDATE_DEBOUNCE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate();
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
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
    // queryKeys is captured via fingerprint so callers can pass inline arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, keyFingerprint]);
}
