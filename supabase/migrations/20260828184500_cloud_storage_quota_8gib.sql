-- Lower default Cloudflare media quota to 8 GiB; alert when used >= quota.

ALTER TABLE public.organization_settings
  ALTER COLUMN cloud_storage_quota_bytes SET DEFAULT 8589934592;

-- Orgs still on the previous 100 GiB default move to 8 GiB.
UPDATE public.organization_settings
SET cloud_storage_quota_bytes = 8589934592
WHERE cloud_storage_quota_bytes = 107374182400;

COMMENT ON COLUMN public.organization_settings.cloud_storage_quota_bytes IS
  'Configured Cloudflare R2 / media library quota for this organization (bytes). Dashboard Storage Alerts when used >= quota (default 8 GiB).';
