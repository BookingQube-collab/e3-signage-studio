-- Phase 5: media library + private object storage.
-- Org-scoped media RLS, version writes for content editors, private `media` bucket.
-- Uploads go through short-lived signed URLs (Supabase Storage now; R2 when configured).

CREATE OR REPLACE FUNCTION public.is_content_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND status = 'ACTIVE'
      AND role IN ('SUPER_ADMIN', 'MARKETING', 'EVENT_MANAGER')
  );
$$;

REVOKE ALL ON FUNCTION public.is_content_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_content_editor() TO authenticated;

DROP POLICY IF EXISTS media_read ON public.media;
CREATE POLICY media_read ON public.media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = media.organization_id
        AND (
          u.role IN ('SUPER_ADMIN', 'MARKETING', 'EVENT_MANAGER')
          OR public.is_super_admin()
        )
    )
  );

DROP POLICY IF EXISTS media_write_content_roles ON public.media;
CREATE POLICY media_write_content_roles ON public.media
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = media.organization_id
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = media.organization_id
    )
  );

DROP POLICY IF EXISTS media_versions_read ON public.media_versions;
CREATE POLICY media_versions_read ON public.media_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.media m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE m.id = media_versions.media_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.role IN ('SUPER_ADMIN', 'MARKETING', 'EVENT_MANAGER')
    )
  );

DROP POLICY IF EXISTS media_versions_write ON public.media_versions;
CREATE POLICY media_versions_write ON public.media_versions
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.media m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE m.id = media_versions.media_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.media m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE m.id = media_versions.media_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  2147483647,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS media_objects_select ON storage.objects;
CREATE POLICY media_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'media'
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS media_objects_insert ON storage.objects;
CREATE POLICY media_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND public.is_content_editor()
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS media_objects_update ON storage.objects;
CREATE POLICY media_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND public.is_content_editor()
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND public.is_content_editor()
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS media_objects_delete ON storage.objects;
CREATE POLICY media_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND public.is_content_editor()
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = auth.uid() AND u.status = 'ACTIVE'
    )
  );
