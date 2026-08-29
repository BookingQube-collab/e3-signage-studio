-- Storage RLS InitPlan wrap (media bucket).
DROP POLICY IF EXISTS media_objects_select ON storage.objects;
CREATE POLICY media_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'media'
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS media_objects_insert ON storage.objects;
CREATE POLICY media_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (SELECT public.is_content_editor())
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS media_objects_update ON storage.objects;
CREATE POLICY media_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND (SELECT public.is_content_editor())
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (SELECT public.is_content_editor())
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS media_objects_delete ON storage.objects;
CREATE POLICY media_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND (SELECT public.is_content_editor())
    AND split_part(name, '/', 1) IN (
      SELECT u.organization_id::text
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );
