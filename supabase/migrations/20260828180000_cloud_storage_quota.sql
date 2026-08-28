-- Org Cloudflare (R2) storage quota + cached usage for dashboard alerts.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS cloud_storage_quota_bytes bigint NOT NULL DEFAULT 107374182400
    CHECK (cloud_storage_quota_bytes > 0),
  ADD COLUMN IF NOT EXISTS cloud_storage_used_bytes bigint
    CHECK (cloud_storage_used_bytes IS NULL OR cloud_storage_used_bytes >= 0),
  ADD COLUMN IF NOT EXISTS cloud_storage_measured_at timestamptz;

COMMENT ON COLUMN public.organization_settings.cloud_storage_quota_bytes IS
  'Configured Cloudflare R2 / media library quota for this organization (bytes). Dashboard alerts when used/quota >= 85%.';
COMMENT ON COLUMN public.organization_settings.cloud_storage_used_bytes IS
  'Cached sum of object sizes under the org R2 prefix (or media_versions fallback).';
COMMENT ON COLUMN public.organization_settings.cloud_storage_measured_at IS
  'When cloud_storage_used_bytes was last measured.';
