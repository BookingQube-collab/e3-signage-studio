-- E3 Digital Signage — initial PostgreSQL schema (Supabase)
-- Apply in the Supabase SQL editor or via `supabase db push` once the project is linked.
-- Requires the auth schema (Supabase Auth). Do not run on a bare Postgres without auth.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.location_type AS ENUM (
  'PERMANENT_FEC',
  'TEMPORARY_EVENT',
  'EXHIBITION',
  'POPUP',
  'OUTDOOR_EVENT',
  'ACTIVATION',
  'OTHER'
);

CREATE TYPE public.location_status AS ENUM (
  'ACTIVE',
  'UPCOMING',
  'INACTIVE',
  'ARCHIVED'
);

CREATE TYPE public.user_role AS ENUM (
  'SUPER_ADMIN',
  'MARKETING',
  'SITE_SUPERVISOR',
  'EVENT_MANAGER'
);

CREATE TYPE public.user_status AS ENUM (
  'ACTIVE',
  'INVITED',
  'DISABLED'
);

CREATE TYPE public.orientation AS ENUM (
  'LANDSCAPE',
  'PORTRAIT'
);

CREATE TYPE public.screen_operational_status AS ENUM (
  'READY',
  'SYNCING',
  'DOWNLOADING',
  'VERIFYING',
  'UPDATING',
  'ERROR',
  'DISABLED'
);

CREATE TYPE public.device_sync_state AS ENUM (
  'WAITING',
  'NOTIFIED',
  'DOWNLOADING',
  'VERIFYING',
  'READY',
  'ACTIVE',
  'FAILED',
  'OFFLINE'
);

CREATE TYPE public.content_package_state AS ENUM (
  'PENDING',
  'DOWNLOADING',
  'VERIFYING',
  'READY',
  'ACTIVE',
  'FAILED'
);

CREATE TYPE public.media_type AS ENUM (
  'VIDEO',
  'IMAGE',
  'QR',
  'LOGO'
);

CREATE TYPE public.media_status AS ENUM (
  'PROCESSING',
  'READY',
  'FAILED',
  'ARCHIVED'
);

CREATE TYPE public.playlist_status AS ENUM (
  'DRAFT',
  'ACTIVE',
  'SCHEDULED',
  'ARCHIVED'
);

CREATE TYPE public.transition AS ENUM (
  'CUT',
  'FADE',
  'SLIDE',
  'ZOOM',
  'NONE'
);

CREATE TYPE public.zone_content_type AS ENUM (
  'VIDEO',
  'IMAGE',
  'SLIDESHOW',
  'TEXT',
  'QR',
  'LOGO',
  'CLOCK',
  'DATE'
);

CREATE TYPE public.fit_mode AS ENUM (
  'FIT',
  'FILL',
  'COVER',
  'CONTAIN',
  'STRETCH'
);

CREATE TYPE public.layout_preset AS ENUM (
  'FULL_SCREEN',
  'SPLIT_50_50',
  'SPLIT_70_30',
  'SPLIT_30_70',
  'VIDEO_SIDE_BANNER',
  'VIDEO_BOTTOM_BANNER',
  'ZONES_3',
  'ZONES_4',
  'PORTRAIT',
  'CUSTOM'
);

CREATE TYPE public.campaign_status AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'PUBLISHING',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED'
);

CREATE TYPE public.campaign_target_type AS ENUM (
  'SCREEN',
  'SCREEN_GROUP',
  'LOCATION',
  'ORGANIZATION'
);

CREATE TYPE public.playback_result AS ENUM (
  'COMPLETED',
  'SKIPPED',
  'ERROR',
  'INTERRUPTED'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Qatar',
  currency text NOT NULL DEFAULT 'QAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  heartbeat_interval_seconds integer NOT NULL DEFAULT 120
    CHECK (heartbeat_interval_seconds BETWEEN 60 AND 300),
  offline_after_seconds integer NOT NULL DEFAULT 300
    CHECK (offline_after_seconds BETWEEN 120 AND 1800),
  sync_poll_interval_seconds integer NOT NULL DEFAULT 120
    CHECK (sync_poll_interval_seconds BETWEEN 60 AND 300),
  pairing_code_ttl_seconds integer NOT NULL DEFAULT 300,
  playback_log_retention_days integer NOT NULL DEFAULT 30,
  error_log_retention_days integer NOT NULL DEFAULT 30,
  storage_cleanup_percent integer NOT NULL DEFAULT 80
    CHECK (storage_cleanup_percent BETWEEN 50 AND 95),
  nightly_sync_window time,
  download_retry_attempts integer NOT NULL DEFAULT 3,
  wifi_only_downloads boolean NOT NULL DEFAULT true,
  auto_sync_on_publish boolean NOT NULL DEFAULT true,
  mute_video_default boolean NOT NULL DEFAULT true,
  loop_playlists boolean NOT NULL DEFAULT true,
  default_image_duration_seconds integer NOT NULL DEFAULT 10,
  default_transition public.transition NOT NULL DEFAULT 'FADE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.roles (
  id public.user_role PRIMARY KEY,
  description text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.roles (id, description, permissions) VALUES
  ('SUPER_ADMIN', 'Full access to every location, device and setting', '{"all": true}'::jsonb),
  ('MARKETING', 'Media, layouts, playlists, campaigns, authorized publishing', '{"content": true, "publish": true}'::jsonb),
  ('SITE_SUPERVISOR', 'Screens, playback and schedules for assigned locations', '{"screens": true, "schedules": true}'::jsonb),
  ('EVENT_MANAGER', 'Campaigns and screens for assigned event locations', '{"events": true, "publish": true}'::jsonb);

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text NOT NULL,
  role public.user_role NOT NULL REFERENCES public.roles (id),
  status public.user_status NOT NULL DEFAULT 'INVITED',
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (organization_id, email)
);

-- ---------------------------------------------------------------------------
-- Locations & screens
-- ---------------------------------------------------------------------------

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  short_name text NOT NULL,
  code text NOT NULL,
  type public.location_type NOT NULL,
  status public.location_status NOT NULL DEFAULT 'ACTIVE',
  description text,
  timezone text NOT NULL DEFAULT 'Asia/Qatar',
  city text,
  start_date date,
  end_date date,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE public.user_location_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (user_id, location_id)
);

CREATE TABLE public.screen_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (organization_id, name)
);

CREATE TABLE public.screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  device_id uuid,
  device_name text,
  screen_type text NOT NULL DEFAULT 'Smart TV',
  orientation public.orientation NOT NULL DEFAULT 'LANDSCAPE',
  width integer NOT NULL DEFAULT 1920 CHECK (width > 0),
  height integer NOT NULL DEFAULT 1080 CHECK (height > 0),
  operational_status public.screen_operational_status NOT NULL DEFAULT 'READY',
  app_version text,
  local_config_version integer,
  cloud_config_version integer,
  local_manifest_version integer,
  cloud_manifest_version integer,
  last_heartbeat_at timestamptz,
  last_sync_at timestamptz,
  total_storage bigint,
  available_storage bigint,
  current_playlist_id uuid,
  currently_playing_media_id uuid,
  last_error text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX screens_device_id_unique ON public.screens (device_id) WHERE device_id IS NOT NULL;

CREATE TABLE public.screen_group_members (
  screen_group_id uuid NOT NULL REFERENCES public.screen_groups (id) ON DELETE CASCADE,
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (screen_group_id, screen_id)
);

-- ---------------------------------------------------------------------------
-- Media (never overwrite: versions are append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  type public.media_type NOT NULL,
  mime_type text NOT NULL,
  current_version_id uuid,
  status public.media_status NOT NULL DEFAULT 'PROCESSING',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE TABLE public.media_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.media (id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_key text NOT NULL,
  thumbnail_key text,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  width integer,
  height integer,
  duration_ms integer,
  checksum_sha256 text NOT NULL CHECK (char_length(checksum_sha256) = 64),
  mime_type text NOT NULL,
  status public.media_status NOT NULL DEFAULT 'PROCESSING',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (media_id, version_number)
);

ALTER TABLE public.media
  ADD CONSTRAINT media_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.media_versions (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Layouts & playlists
-- Zones store 0–100 percentages to match the Lovable builder.
-- Device JSON converts to pixels using layout width_px / height_px at publish.
-- ---------------------------------------------------------------------------

CREATE TABLE public.layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  preset public.layout_preset NOT NULL DEFAULT 'CUSTOM',
  orientation public.orientation NOT NULL DEFAULT 'LANDSCAPE',
  width_px integer NOT NULL DEFAULT 1920,
  height_px integer NOT NULL DEFAULT 1080,
  background text NOT NULL DEFAULT '#19161A',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE TABLE public.layout_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.layouts (id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.zone_content_type NOT NULL,
  x_percent numeric(6, 3) NOT NULL CHECK (x_percent >= 0 AND x_percent <= 100),
  y_percent numeric(6, 3) NOT NULL CHECK (y_percent >= 0 AND y_percent <= 100),
  width_percent numeric(6, 3) NOT NULL CHECK (width_percent > 0 AND width_percent <= 100),
  height_percent numeric(6, 3) NOT NULL CHECK (height_percent > 0 AND height_percent <= 100),
  content_ref text,
  fit public.fit_mode NOT NULL DEFAULT 'CONTAIN',
  background text NOT NULL DEFAULT '#252229',
  duration_seconds numeric(8, 2) NOT NULL DEFAULT 15,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  status public.playlist_status NOT NULL DEFAULT 'DRAFT',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE TABLE public.playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists (id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media (id) ON DELETE RESTRICT,
  media_version_id uuid NOT NULL REFERENCES public.media_versions (id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  duration_seconds numeric(8, 2) NOT NULL CHECK (duration_seconds > 0),
  transition public.transition NOT NULL DEFAULT 'FADE',
  layout_id uuid REFERENCES public.layouts (id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 10 CHECK (priority BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, position)
);

ALTER TABLE public.screens
  ADD CONSTRAINT screens_current_playlist_fk
  FOREIGN KEY (current_playlist_id) REFERENCES public.playlists (id) ON DELETE SET NULL;

ALTER TABLE public.screens
  ADD CONSTRAINT screens_playing_media_fk
  FOREIGN KEY (currently_playing_media_id) REFERENCES public.media (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Campaigns & schedules
-- ---------------------------------------------------------------------------

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  playlist_id uuid REFERENCES public.playlists (id) ON DELETE RESTRICT,
  layout_id uuid REFERENCES public.layouts (id) ON DELETE RESTRICT,
  status public.campaign_status NOT NULL DEFAULT 'DRAFT',
  emergency boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CHECK (playlist_id IS NOT NULL OR layout_id IS NOT NULL OR status = 'DRAFT')
);

CREATE TABLE public.campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  type public.campaign_target_type NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type = 'ORGANIZATION' AND target_id IS NULL)
    OR (type <> 'ORGANIZATION' AND target_id IS NOT NULL)
  )
);

CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  timezone text NOT NULL DEFAULT 'Asia/Qatar',
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Devices, manifests, sync
-- ---------------------------------------------------------------------------

CREATE TABLE public.device_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  screen_id uuid REFERENCES public.screens (id) ON DELETE SET NULL,
  app_version text,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_pairing_codes_active_idx
  ON public.device_pairing_codes (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  revoked_at timestamptz,
  rotated_from_id uuid REFERENCES public.device_tokens (id) ON DELETE SET NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX device_tokens_one_active_per_screen
  ON public.device_tokens (screen_id)
  WHERE revoked_at IS NULL;

CREATE TABLE public.content_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  manifest_version integer NOT NULL CHECK (manifest_version > 0),
  config_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  UNIQUE (screen_id, manifest_version)
);

CREATE TABLE public.manifest_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES public.content_manifests (id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media (id) ON DELETE RESTRICT,
  media_version_id uuid NOT NULL REFERENCES public.media_versions (id) ON DELETE RESTRICT,
  checksum_sha256 text NOT NULL,
  file_size bigint NOT NULL,
  local_filename text NOT NULL,
  asset_type public.media_type NOT NULL
);

-- Table is plural: Postgres forbids a table named the same as enum type device_sync_state.
CREATE TABLE public.device_sync_states (
  screen_id uuid PRIMARY KEY REFERENCES public.screens (id) ON DELETE CASCADE,
  local_manifest_version integer,
  cloud_manifest_version integer,
  local_config_version integer,
  cloud_config_version integer,
  package_state public.content_package_state NOT NULL DEFAULT 'PENDING',
  sync_state public.device_sync_state NOT NULL DEFAULT 'WAITING',
  sync_progress numeric(5, 2) NOT NULL DEFAULT 0,
  active_manifest_id uuid REFERENCES public.content_manifests (id) ON DELETE SET NULL,
  previous_manifest_id uuid REFERENCES public.content_manifests (id) ON DELETE SET NULL,
  pending_manifest_id uuid REFERENCES public.content_manifests (id) ON DELETE SET NULL,
  sync_requested_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.device_download_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  manifest_id uuid NOT NULL REFERENCES public.content_manifests (id) ON DELETE CASCADE,
  media_version_id uuid NOT NULL REFERENCES public.media_versions (id) ON DELETE CASCADE,
  bytes_received bigint NOT NULL DEFAULT 0,
  bytes_total bigint,
  verified boolean NOT NULL DEFAULT false,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (screen_id, manifest_id, media_version_id)
);

CREATE TABLE public.device_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  device_id uuid,
  app_version text,
  uptime_seconds integer,
  active_manifest_version integer,
  active_playlist_id uuid,
  currently_playing_media_id uuid,
  total_storage bigint,
  available_storage bigint,
  network_online boolean,
  last_successful_sync_at timestamptz,
  last_error text,
  operational_status public.screen_operational_status,
  sync_state public.device_sync_state,
  sync_progress numeric(5, 2),
  received_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Logs
-- ---------------------------------------------------------------------------

CREATE TABLE public.playback_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  client_event_id uuid NOT NULL,
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns (id) ON DELETE SET NULL,
  playlist_id uuid REFERENCES public.playlists (id) ON DELETE SET NULL,
  media_id uuid NOT NULL REFERENCES public.media (id) ON DELETE RESTRICT,
  media_version_id uuid REFERENCES public.media_versions (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_ms integer NOT NULL DEFAULT 0,
  result public.playback_result NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, client_event_id)
);

CREATE TABLE public.sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id uuid NOT NULL REFERENCES public.screens (id) ON DELETE CASCADE,
  manifest_id uuid REFERENCES public.content_manifests (id) ON DELETE SET NULL,
  from_state public.device_sync_state,
  to_state public.device_sync_state NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  source text NOT NULL,
  message text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Access helpers (created after tables they reference)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN' AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_location_access(loc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_location_access a
      JOIN public.users u ON u.id = a.user_id
      JOIN public.locations l ON l.id = a.location_id
      WHERE a.user_id = auth.uid()
        AND a.location_id = loc_id
        AND u.status = 'ACTIVE'
        AND (
          u.role <> 'EVENT_MANAGER'
          OR l.type IN (
            'TEMPORARY_EVENT',
            'EXHIBITION',
            'POPUP',
            'OUTDOOR_EVENT',
            'ACTIVATION'
          )
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- Live screen view: connectivity is derived from heartbeat, never faked
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_screens_live
WITH (security_invoker = true) AS
SELECT
  s.*,
  COALESCE(os.offline_after_seconds, 300) AS offline_after_seconds,
  CASE
    WHEN s.operational_status = 'DISABLED' THEN 'DISABLED'
    WHEN s.last_heartbeat_at IS NULL THEN 'OFFLINE'
    WHEN s.last_heartbeat_at < (now() - make_interval(secs => COALESCE(os.offline_after_seconds, 300))) THEN 'OFFLINE'
    ELSE 'ONLINE'
  END AS connectivity
FROM public.screens s
LEFT JOIN public.organization_settings os ON os.organization_id = s.organization_id;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX locations_org_idx ON public.locations (organization_id);
CREATE INDEX locations_status_idx ON public.locations (status);
CREATE INDEX screens_location_idx ON public.screens (location_id);
CREATE INDEX screens_heartbeat_idx ON public.screens (last_heartbeat_at);
CREATE INDEX media_org_idx ON public.media (organization_id);
CREATE INDEX media_versions_media_idx ON public.media_versions (media_id);
CREATE INDEX playlist_items_playlist_idx ON public.playlist_items (playlist_id);
CREATE INDEX campaigns_org_idx ON public.campaigns (organization_id);
CREATE INDEX campaign_targets_campaign_idx ON public.campaign_targets (campaign_id);
CREATE INDEX schedules_campaign_idx ON public.schedules (campaign_id);
CREATE INDEX manifests_screen_idx ON public.content_manifests (screen_id, manifest_version DESC);
CREATE INDEX heartbeats_screen_received_idx ON public.device_heartbeats (screen_id, received_at DESC);
CREATE INDEX playback_logs_screen_started_idx ON public.playback_logs (screen_id, started_at DESC);
CREATE INDEX audit_logs_org_created_idx ON public.audit_logs (organization_id, created_at DESC);
CREATE INDEX user_location_access_user_idx ON public.user_location_access (user_id);

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_location_access(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations',
    'organization_settings',
    'users',
    'locations',
    'screen_groups',
    'screens',
    'media',
    'layouts',
    'layout_zones',
    'playlists',
    'campaigns',
    'schedules',
    'device_sync_states'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Device APIs use the service role after verifying a device token (bypasses RLS).
-- Admin uses authenticated JWT. Tighten further in Phase 3 / 14.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screen_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screen_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layout_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifest_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sync_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_download_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY users_read_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin());

CREATE POLICY locations_read ON public.locations
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_location_access(id));

CREATE POLICY locations_write_admin ON public.locations
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY screens_read ON public.screens
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_location_access(location_id));

CREATE POLICY screens_write ON public.screens
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_location_access(location_id))
  WITH CHECK (public.is_super_admin() OR public.has_location_access(location_id));

CREATE POLICY media_read ON public.media
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.status = 'ACTIVE')
  );

CREATE POLICY media_write_content_roles ON public.media
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('MARKETING', 'EVENT_MANAGER') AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('MARKETING', 'EVENT_MANAGER') AND u.status = 'ACTIVE'
    )
  );

CREATE POLICY campaigns_read ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.status = 'ACTIVE')
  );

CREATE POLICY org_member_read_playlists ON public.playlists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE' AND u.organization_id = playlists.organization_id
    )
  );

CREATE POLICY org_member_read_layouts ON public.layouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE' AND u.organization_id = layouts.organization_id
    )
  );

CREATE POLICY playlist_items_read ON public.playlist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      JOIN public.users u ON u.organization_id = p.organization_id
      WHERE p.id = playlist_items.playlist_id AND u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

CREATE POLICY layout_zones_read ON public.layout_zones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.layouts l
      JOIN public.users u ON u.organization_id = l.organization_id
      WHERE l.id = layout_zones.layout_id AND u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

CREATE POLICY media_versions_read ON public.media_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.media m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE m.id = media_versions.media_id AND u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

CREATE POLICY screen_groups_read ON public.screen_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE' AND u.organization_id = screen_groups.organization_id
    )
  );

CREATE POLICY screen_group_members_read ON public.screen_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = screen_group_members.screen_id
        AND (public.is_super_admin() OR public.has_location_access(s.location_id))
    )
  );

CREATE POLICY campaign_targets_read ON public.campaign_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = campaign_targets.campaign_id AND u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

CREATE POLICY schedules_read ON public.schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = schedules.campaign_id AND u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

CREATE POLICY sync_state_read ON public.device_sync_states
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (public.is_super_admin() OR public.has_location_access(s.location_id))
    )
  );

CREATE POLICY playback_logs_read ON public.playback_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = playback_logs.screen_id
        AND (public.is_super_admin() OR public.has_location_access(s.location_id))
    )
  );

CREATE POLICY audit_read_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Pairing codes / device tokens: no direct client access. Service role only.
CREATE POLICY pairing_no_client ON public.device_pairing_codes
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY device_tokens_no_client ON public.device_tokens
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Realtime (optional; ignored if publication is absent)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.screens';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.device_sync_states';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.device_heartbeats';
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Privileges for Supabase roles. RLS remains the access-control layer.
-- Needed when this file is applied as the postgres role via psql / CLI.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  LOOP
    EXECUTE format(
      'GRANT USAGE ON TYPE public.%I TO anon, authenticated, service_role',
      r.typname
    );
  END LOOP;
END $$;
