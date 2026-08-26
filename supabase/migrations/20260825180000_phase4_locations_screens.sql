-- Phase 4: location/screen/group inventory.
-- Marketing can read every org location/screen. Site Supervisors and Event Managers
-- stay limited by has_location_access (assigned rows; event types for Event Manager).
-- Write policies for groups, membership, and sync state. Seed the 7 E3 venues if empty.

CREATE OR REPLACE FUNCTION public.is_org_wide_reader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND status = 'ACTIVE' AND role = 'MARKETING'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_wide_reader() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_wide_reader() TO authenticated;

DROP POLICY IF EXISTS locations_read ON public.locations;
CREATE POLICY locations_read ON public.locations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_location_access(id)
    OR (
      public.is_org_wide_reader()
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.status = 'ACTIVE'
          AND u.organization_id = locations.organization_id
      )
    )
  );

DROP POLICY IF EXISTS screens_read ON public.screens;
CREATE POLICY screens_read ON public.screens
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_location_access(location_id)
    OR (
      public.is_org_wide_reader()
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.status = 'ACTIVE'
          AND u.organization_id = screens.organization_id
      )
    )
  );

DROP POLICY IF EXISTS screen_groups_write ON public.screen_groups;
CREATE POLICY screen_groups_write ON public.screen_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = screen_groups.organization_id
        AND u.role IN ('SUPER_ADMIN', 'MARKETING', 'SITE_SUPERVISOR', 'EVENT_MANAGER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = screen_groups.organization_id
        AND u.role IN ('SUPER_ADMIN', 'MARKETING', 'SITE_SUPERVISOR', 'EVENT_MANAGER')
    )
  );

DROP POLICY IF EXISTS screen_group_members_write ON public.screen_group_members;
CREATE POLICY screen_group_members_write ON public.screen_group_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = screen_group_members.screen_id
        AND (
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = screen_group_members.screen_id
        AND (
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
        )
    )
  );

DROP POLICY IF EXISTS sync_state_write ON public.device_sync_states;
CREATE POLICY sync_state_write ON public.device_sync_states
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (public.is_super_admin() OR public.has_location_access(s.location_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (public.is_super_admin() OR public.has_location_access(s.location_id))
    )
  );

DROP POLICY IF EXISTS heartbeats_read ON public.device_heartbeats;
CREATE POLICY heartbeats_read ON public.device_heartbeats
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_heartbeats.screen_id
        AND (
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
        )
    )
  );

-- Seed the 7 initial locations for the first organisation if it has none.
-- Screens are not seeded — Pair Screen is the real path; they stay offline until heartbeat.
INSERT INTO public.locations (
  organization_id, name, short_name, code, type, status, city, timezone
)
SELECT
  o.id,
  s.name,
  s.short_name,
  s.code,
  s.type::public.location_type,
  s.status::public.location_status,
  s.city,
  'Asia/Qatar'
FROM (
  SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1
) o
CROSS JOIN (
  VALUES
    ('KDS', 'KDS', 'KDS', 'PERMANENT_FEC', 'ACTIVE', 'Doha'),
    ('InflataPark', 'InflataPark', 'INFLATAPARK', 'PERMANENT_FEC', 'ACTIVE', 'Doha'),
    ('Urban Arena', 'Urban Arena', 'URBAN-ARENA', 'PERMANENT_FEC', 'ACTIVE', 'Lusail'),
    ('Crayons & Bricks Vendome Mall', 'C&B Vendome', 'CB-VENDOME', 'PERMANENT_FEC', 'ACTIVE', 'Lusail'),
    ('Crayons & Bricks Dar Al Salam Mall', 'C&B Dar Al Salam', 'CB-DAR-AL-SALAM', 'PERMANENT_FEC', 'ACTIVE', 'Doha'),
    ('Carousel Aspire Park', 'Carousel Aspire', 'CAROUSEL-ASPIRE', 'OUTDOOR_EVENT', 'ACTIVE', 'Doha'),
    ('Event Qatar Show', 'Event Qatar Show', 'EVENT-QATAR-SHOW', 'EXHIBITION', 'UPCOMING', 'DECC')
) AS s(name, short_name, code, type, status, city)
WHERE NOT EXISTS (
  SELECT 1 FROM public.locations l WHERE l.organization_id = o.id
);
