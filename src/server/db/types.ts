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

export type UserRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  status: string;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
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
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type ScreenGroupRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type DeviceSyncStateRow = {
  screen_id: string;
  local_manifest_version: number | null;
  cloud_manifest_version: number | null;
  local_config_version: number | null;
  cloud_config_version: number | null;
  package_state: string;
  sync_state: string;
  sync_progress: number;
  sync_requested_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export type MediaFolderRow = {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type MediaRow = {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  mime_type: string;
  current_version_id: string | null;
  status: string;
  archived_at: string | null;
  folder_id: string | null;
  location_ids: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  uploaded_by: string | null;
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
  created_by: string | null;
};

export type PlaylistRow = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type PlaylistItemRow = {
  id: string;
  playlist_id: string;
  media_id: string;
  media_version_id: string;
  position: number;
  duration_seconds: number;
  transition: string;
  layout_id: string | null;
  priority: number;
};

export type LayoutRow = {
  id: string;
  organization_id: string;
  name: string;
  preset: string;
  orientation: string;
  width_px: number;
  height_px: number;
  background: string;
  device_json: unknown;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type LayoutZoneRow = {
  id: string;
  layout_id: string;
  name: string;
  type: string;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  content_ref: string | null;
  fit: string;
  background: string;
  duration_seconds: number;
  sort_order: number;
};

export type CampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  playlist_id: string | null;
  layout_id: string | null;
  status: string;
  emergency: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type CampaignTargetRow = {
  id: string;
  campaign_id: string;
  type: string;
  target_id: string | null;
};

export type ScheduleRow = {
  id: string;
  campaign_id: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  timezone: string;
  priority: number;
};
