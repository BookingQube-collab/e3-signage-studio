/**
 * Row shapes mirroring the Phase 2 Postgres schema.
 * Used by repositories in later phases — not imported by UI pages.
 */

export type OrganizationRow = {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type LocationRow = {
  id: string;
  organization_id: string;
  name: string;
  short_name: string;
  code: string;
  type: string;
  status: string;
  description: string | null;
  timezone: string;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ScreenRow = {
  id: string;
  organization_id: string;
  location_id: string;
  name: string;
  device_id: string | null;
  device_name: string | null;
  screen_type: string;
  orientation: string;
  width: number;
  height: number;
  operational_status: string;
  app_version: string | null;
  local_config_version: number | null;
  cloud_config_version: number | null;
  local_manifest_version: number | null;
  cloud_manifest_version: number | null;
  last_heartbeat_at: string | null;
  last_sync_at: string | null;
  total_storage: number | null;
  available_storage: number | null;
  current_playlist_id: string | null;
  currently_playing_media_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaVersionRow = {
  id: string;
  media_id: string;
  version_number: number;
  storage_key: string;
  thumbnail_key: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum_sha256: string;
  mime_type: string;
  status: string;
  created_at: string;
};
