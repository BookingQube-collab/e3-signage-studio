export const DEFAULT_OFFLINE_AFTER_SECONDS = 300;

export type DerivedConnectivity = "ONLINE" | "OFFLINE" | "DISABLED";

/**
 * Connectivity is derived from last_heartbeat_at, never stored as a fake online flag.
 * Default window is 5 minutes when the player heartbeats about every 2 minutes.
 */
export function connectivityFromHeartbeat(
  operationalStatus: string,
  lastHeartbeatAt: string | null,
  offlineAfterSeconds: number = DEFAULT_OFFLINE_AFTER_SECONDS,
  nowMs: number = Date.now(),
): DerivedConnectivity {
  if (operationalStatus === "DISABLED") return "DISABLED";
  if (!lastHeartbeatAt) return "OFFLINE";
  const at = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(at)) return "OFFLINE";
  const windowMs = Math.max(offlineAfterSeconds, 1) * 1000;
  if (nowMs - at > windowMs) return "OFFLINE";
  return "ONLINE";
}
