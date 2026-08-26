-- Phase 3: CMS profile bootstrap, user write policies, location-access policies.
-- Idempotent enough to re-run (DROP POLICY IF EXISTS + CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- Resolve / bootstrap CMS profile for the signed-in Auth user.
-- If public.users is empty, the first successful login becomes Super Admin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_cms_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  auth_email text;
  full_name text;
  org_id uuid;
  user_count integer;
  result public.users;
  loc_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  SELECT count(*)::integer INTO user_count FROM public.users;
  SELECT * INTO result FROM public.users WHERE id = uid;

  IF result.id IS NULL THEN
    IF user_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_PROFILE');
    END IF;

    SELECT
      u.email,
      COALESCE(
        u.raw_user_meta_data->>'name',
        u.raw_user_meta_data->>'full_name',
        split_part(COALESCE(u.email, 'admin'), '@', 1)
      )
    INTO auth_email, full_name
    FROM auth.users u
    WHERE u.id = uid;

    IF auth_email IS NULL OR auth_email = '' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_PROFILE');
    END IF;

    SELECT id INTO org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    IF org_id IS NULL THEN
      INSERT INTO public.organizations (name)
      VALUES ('E3 Entertainment')
      RETURNING id INTO org_id;
      INSERT INTO public.organization_settings (organization_id)
      VALUES (org_id);
    END IF;

    INSERT INTO public.users (
      id, organization_id, name, email, role, status, last_active_at
    ) VALUES (
      uid, org_id, full_name, auth_email, 'SUPER_ADMIN', 'ACTIVE', now()
    )
    RETURNING * INTO result;
  ELSE
    IF result.status = 'DISABLED' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'DISABLED');
    END IF;

    UPDATE public.users
    SET
      last_active_at = now(),
      status = CASE
        WHEN status = 'INVITED' THEN 'ACTIVE'::public.user_status
        ELSE status
      END
    WHERE id = uid
    RETURNING * INTO result;
  END IF;

  SELECT coalesce(array_agg(location_id), ARRAY[]::uuid[])
  INTO loc_ids
  FROM public.user_location_access
  WHERE user_id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'id', result.id,
      'organizationId', result.organization_id,
      'name', result.name,
      'email', result.email,
      'role', result.role,
      'status', result.status,
      'locationIds', to_jsonb(loc_ids),
      'lastActiveAt', result.last_active_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_cms_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_cms_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: users writes (Super Admin). Bootstrap uses SECURITY DEFINER above.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_insert_admin ON public.users;
CREATE POLICY users_insert_admin ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- RLS: location assignments
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ula_read ON public.user_location_access;
CREATE POLICY ula_read ON public.user_location_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS ula_write_admin ON public.user_location_access;
CREATE POLICY ula_write_admin ON public.user_location_access
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- RLS: organisation (needed so Super Admin can read org after bootstrap)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_read_member ON public.organizations;
CREATE POLICY org_read_member ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = organizations.id
    )
  );

DROP POLICY IF EXISTS org_write_admin ON public.organizations;
CREATE POLICY org_write_admin ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS org_settings_read ON public.organization_settings;
CREATE POLICY org_settings_read ON public.organization_settings
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = organization_settings.organization_id
    )
  );

DROP POLICY IF EXISTS org_settings_write_admin ON public.organization_settings;
CREATE POLICY org_settings_write_admin ON public.organization_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
