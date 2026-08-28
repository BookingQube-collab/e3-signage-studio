-- Lock down SECURITY DEFINER helpers and pin search_path.
-- RLS policies still need EXECUTE for authenticated; anon/PUBLIC must not.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Avoid a users-row write on every CMS page load (was slowing navigation).
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

  SELECT * INTO result FROM public.users WHERE id = uid;

  IF result.id IS NULL THEN
    SELECT count(*)::integer INTO user_count FROM public.users;
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

    IF result.status = 'INVITED'
      OR result.last_active_at IS NULL
      OR result.last_active_at < now() - interval '5 minutes' THEN
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

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.current_user_role()',
    'public.is_super_admin()',
    'public.has_location_access(uuid)',
    'public.is_org_wide_reader()',
    'public.is_content_editor()',
    'public.is_layout_editor()',
    'public.current_user_location_ids()',
    'public.is_location_scoped_user()',
    'public.campaign_intersects_user_locations(uuid)',
    'public.can_read_screen(uuid)',
    'public.resolve_cms_profile()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END
$$;

-- Trigger helper (not SECURITY DEFINER). Authenticated updates fire it.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;
