-- Soft-delete media folders so a delete stays gone after refresh, and a later
-- create with the same name (e.g. InflataPark) becomes a new live folder.

ALTER TABLE public.media_folders
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP INDEX IF EXISTS media_folders_org_name_idx;

CREATE UNIQUE INDEX IF NOT EXISTS media_folders_org_live_name_idx
  ON public.media_folders (organization_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

NOTIFY pgrst, 'reload schema';
