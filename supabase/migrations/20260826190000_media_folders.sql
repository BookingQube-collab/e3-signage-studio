-- Media library folders (one level). Organization only — playlists still pick any file.
-- Unfiled = media.folder_id IS NULL. Deleting a folder refuses if it still has
-- visible files; leftover archived rows become unfiled (ON DELETE SET NULL).

CREATE TABLE IF NOT EXISTS public.media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT media_folders_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS media_folders_org_name_idx
  ON public.media_folders (organization_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS media_folders_org_idx
  ON public.media_folders (organization_id, name);

ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.media_folders (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS media_folder_id_idx ON public.media (folder_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.media_folders;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.media_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.media_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_folders_read ON public.media_folders;
CREATE POLICY media_folders_read ON public.media_folders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
        AND (
          u.role IN ('SUPER_ADMIN', 'MARKETING', 'EVENT_MANAGER')
          OR public.is_super_admin()
        )
    )
  );

DROP POLICY IF EXISTS media_folders_write ON public.media_folders;
CREATE POLICY media_folders_write ON public.media_folders
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
    )
  );

GRANT ALL ON TABLE public.media_folders TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
