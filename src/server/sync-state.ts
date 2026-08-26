import type { ContentPackageState, DeviceSyncState } from "@e3/shared-types";

/**
 * Device content package + admin-visible sync state machine.
 *
 * Playback always uses the ACTIVE package. A new package cannot become ACTIVE
 * until it is fully downloaded, checksum-verified, and configuration-validated.
 * FAILED never replaces ACTIVE. Previous known-good is retained for rollback.
 */

export const PACKAGE_TRANSITIONS: Record<ContentPackageState, readonly ContentPackageState[]> = {
  PENDING: ["DOWNLOADING", "FAILED"],
  DOWNLOADING: ["VERIFYING", "FAILED", "DOWNLOADING"],
  VERIFYING: ["READY", "FAILED"],
  READY: ["ACTIVE", "FAILED"],
  ACTIVE: ["FAILED"],
  FAILED: ["PENDING", "DOWNLOADING"],
};

export const SYNC_TRANSITIONS: Record<DeviceSyncState, readonly DeviceSyncState[]> = {
  WAITING: ["NOTIFIED", "DOWNLOADING", "OFFLINE"],
  NOTIFIED: ["DOWNLOADING", "OFFLINE", "FAILED"],
  DOWNLOADING: ["VERIFYING", "OFFLINE", "FAILED", "DOWNLOADING"],
  VERIFYING: ["READY", "FAILED"],
  READY: ["ACTIVE", "FAILED"],
  ACTIVE: ["WAITING", "NOTIFIED", "OFFLINE", "FAILED"],
  FAILED: ["WAITING", "NOTIFIED", "DOWNLOADING"],
  OFFLINE: ["WAITING", "NOTIFIED", "DOWNLOADING", "ACTIVE"],
};

export function canTransitionPackage(from: ContentPackageState, to: ContentPackageState): boolean {
  return PACKAGE_TRANSITIONS[from].includes(to);
}

export function canTransitionSync(from: DeviceSyncState, to: DeviceSyncState): boolean {
  return SYNC_TRANSITIONS[from].includes(to);
}

export function shouldFetchManifest(localVersion: number, cloudVersion: number): boolean {
  return cloudVersion > localVersion;
}
