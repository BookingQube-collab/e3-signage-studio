-- Pending Cloudflare resync filters media by organization + PROCESSING/FAILED
-- and matches media_versions.storage_key in small IN chunks. Without these
-- indexes a full scan can exceed Supabase statement_timeout (~8s).

CREATE INDEX IF NOT EXISTS media_org_status_idx
  ON public.media (organization_id, status);

CREATE INDEX IF NOT EXISTS media_versions_storage_key_idx
  ON public.media_versions (storage_key);
