-- Phase 15: location-scoped Site Supervisor access.
-- Super Admin / Marketing stay org-wide. SITE_SUPERVISOR (and EVENT_MANAGER)
-- see assigned locations plus owned or location-used content.
-- Additive: media.location_ids; pairing / R2 / folders unchanged.

ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS location_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS media_location_ids_gin
  ON public.media USING GIN (location_ids);

CREATE OR REPLACE FUNCTION public.current_user_location_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(a.location_id), ARRAY[]::uuid[])
  FROM public.user_location_access a
  JOIN public.users u ON u.id = a.user_id
  WHERE a.user_id = auth.uid()
    AND u.status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.is_location_scoped_user()
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
      AND role IN ('SITE_SUPERVISOR', 'EVENT_MANAGER')
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_location_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_location_scoped_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_location_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_location_scoped_user() TO authenticated;

-- Site Supervisors upload and edit media / playlists / campaigns for their sites.
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
      AND role IN ('SUPER_ADMIN', 'MARKETING', 'SITE_SUPERVISOR', 'EVENT_MANAGER')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_layout_editor()
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
      AND role IN ('SUPER_ADMIN', 'MARKETING', 'SITE_SUPERVISOR')
  );
$$;

CREATE OR REPLACE FUNCTION public.campaign_intersects_user_locations(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign_targets t
    JOIN public.screens s
      ON (
        (t.type = 'SCREEN' AND t.target_id = s.id)
        OR (t.type = 'LOCATION' AND t.target_id = s.location_id)
      )
    WHERE t.campaign_id = p_campaign_id
      AND public.has_location_access(s.location_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.campaign_targets t
    JOIN public.screen_group_members m ON t.type = 'SCREEN_GROUP' AND t.target_id = m.screen_group_id
    JOIN public.screens s ON s.id = m.screen_id
    WHERE t.campaign_id = p_campaign_id
      AND public.has_location_access(s.location_id)
  );
$$;

REVOKE ALL ON FUNCTION public.campaign_intersects_user_locations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_intersects_user_locations(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Media: org-wide for Super Admin / Marketing; owned, tagged, or used at
-- assigned locations for Site Supervisor / Event Manager.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS media_read ON public.media;
CREATE POLICY media_read ON public.media
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.is_org_wide_reader()
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.status = 'ACTIVE'
          AND u.organization_id = media.organization_id
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.status = 'ACTIVE'
          AND u.organization_id = media.organization_id
      )
      AND (
        media.created_by = auth.uid()
        OR media.uploaded_by = auth.uid()
        OR media.location_ids && public.current_user_location_ids()
        OR EXISTS (
          SELECT 1
          FROM public.playlist_items pi
          JOIN public.screens s ON s.current_playlist_id = pi.playlist_id
          WHERE pi.media_id = media.id
            AND public.has_location_access(s.location_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.playlist_items pi
          JOIN public.campaigns c ON c.playlist_id = pi.playlist_id
          WHERE pi.media_id = media.id
            AND public.campaign_intersects_user_locations(c.id)
        )
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
    AND (
      NOT public.is_location_scoped_user()
      OR media.created_by = auth.uid()
      OR media.uploaded_by = auth.uid()
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
    AND (
      NOT public.is_location_scoped_user()
      OR media.created_by = auth.uid()
      OR media.uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS media_versions_read ON public.media_versions;
CREATE POLICY media_versions_read ON public.media_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.media m
      WHERE m.id = media_versions.media_id
    )
  );

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
          public.is_content_editor()
          OR public.is_super_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Playlists / layouts: org-wide editors see all; scoped users see owned + used.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS org_member_read_playlists ON public.playlists;
CREATE POLICY org_member_read_playlists ON public.playlists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
        AND (
          NOT public.is_location_scoped_user()
          OR playlists.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.screens s
            WHERE s.current_playlist_id = playlists.id
              AND public.has_location_access(s.location_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.playlist_id = playlists.id
              AND public.campaign_intersects_user_locations(c.id)
          )
        )
    )
  );

DROP POLICY IF EXISTS playlists_write ON public.playlists;
CREATE POLICY playlists_write ON public.playlists
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
    )
    AND (
      NOT public.is_location_scoped_user()
      OR playlists.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
    )
    AND (
      NOT public.is_location_scoped_user()
      OR playlists.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS org_member_read_layouts ON public.layouts;
CREATE POLICY org_member_read_layouts ON public.layouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
        AND (
          NOT public.is_location_scoped_user()
          OR layouts.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.layout_id = layouts.id
              AND public.campaign_intersects_user_locations(c.id)
          )
          OR EXISTS (
            SELECT 1 FROM public.playlist_items pi
            JOIN public.screens s ON s.current_playlist_id = pi.playlist_id
            WHERE pi.layout_id = layouts.id
              AND public.has_location_access(s.location_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS layouts_write ON public.layouts;
CREATE POLICY layouts_write ON public.layouts
  FOR ALL TO authenticated
  USING (
    public.is_layout_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
    )
    AND (
      NOT public.is_location_scoped_user()
      OR layouts.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.is_layout_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
    )
    AND (
      NOT public.is_location_scoped_user()
      OR layouts.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Campaigns: scoped users see campaigns that hit their locations (or drafts they own).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS campaigns_read ON public.campaigns;
CREATE POLICY campaigns_read ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
        AND (
          NOT public.is_location_scoped_user()
          OR campaigns.created_by = auth.uid()
          OR public.campaign_intersects_user_locations(campaigns.id)
        )
    )
  );

DROP POLICY IF EXISTS campaigns_write ON public.campaigns;
CREATE POLICY campaigns_write ON public.campaigns
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
    )
    AND (
      NOT public.is_location_scoped_user()
      OR campaigns.created_by = auth.uid()
      OR public.campaign_intersects_user_locations(campaigns.id)
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
    )
    AND (
      NOT public.is_location_scoped_user()
      OR campaigns.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS playlist_items_read ON public.playlist_items;
CREATE POLICY playlist_items_read ON public.playlist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_items.playlist_id
    )
  );

DROP POLICY IF EXISTS layout_zones_read ON public.layout_zones;
CREATE POLICY layout_zones_read ON public.layout_zones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.layouts l
      WHERE l.id = layout_zones.layout_id
    )
  );

DROP POLICY IF EXISTS campaign_targets_read ON public.campaign_targets;
CREATE POLICY campaign_targets_read ON public.campaign_targets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_targets.campaign_id
    )
  );

DROP POLICY IF EXISTS schedules_read ON public.schedules;
CREATE POLICY schedules_read ON public.schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = schedules.campaign_id
    )
  );

UPDATE public.roles
SET
  description = 'Screens, media, playlists, layouts, campaigns and schedules for assigned locations',
  permissions = '{"screens": true, "schedules": true, "media": true, "playlists": true, "layouts": true, "campaigns": true}'::jsonb
WHERE id = 'SITE_SUPERVISOR';

NOTIFY pgrst, 'reload schema';
