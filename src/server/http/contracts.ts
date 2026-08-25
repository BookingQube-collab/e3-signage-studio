import type { DeviceHeartbeatRequest, LocationCreate, PlaybackLogBatch } from "@e3/api-contracts";

/**
 * HTTP handler contracts. Wired to TanStack Start routes in later phases.
 * Implementations must validate with Zod before touching the database.
 */

export type JsonResult<T> = { status: number; body: T };

export type DeviceHttp = {
  pair: (input: unknown) => Promise<JsonResult<unknown>>;
  activate: (input: unknown) => Promise<JsonResult<unknown>>;
  syncStatus: (deviceId: string, token: string) => Promise<JsonResult<unknown>>;
  manifest: (deviceId: string, token: string) => Promise<JsonResult<unknown>>;
  heartbeat: (
    deviceId: string,
    token: string,
    input: DeviceHeartbeatRequest,
  ) => Promise<JsonResult<unknown>>;
  syncConfirmation: (
    deviceId: string,
    token: string,
    input: unknown,
  ) => Promise<JsonResult<unknown>>;
  playbackLogs: (
    deviceId: string,
    token: string,
    input: PlaybackLogBatch,
  ) => Promise<JsonResult<unknown>>;
  errorLogs: (deviceId: string, token: string, input: unknown) => Promise<JsonResult<unknown>>;
};

export type AdminHttp = {
  createLocation: (userId: string, input: LocationCreate) => Promise<JsonResult<unknown>>;
  pairScreen: (userId: string, input: unknown) => Promise<JsonResult<unknown>>;
  requestSync: (userId: string, screenId: string) => Promise<JsonResult<unknown>>;
  publishCampaign: (
    userId: string,
    campaignId: string,
    emergency: boolean,
  ) => Promise<JsonResult<unknown>>;
};
