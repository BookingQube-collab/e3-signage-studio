-- Performance Advisor: Auth RLS InitPlan + duplicate indexes.
-- Wrap auth.uid() / SECURITY DEFINER helpers in (SELECT ...) so Postgres
-- evaluates them once per query instead of once per row.
-- Drop identical indexes that only add write overhead.

-- ---------------------------------------------------------------------------
-- Helper functions: cache auth.uid() once inside each body
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND role = 'SUPER_ADMIN'
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_location_access(loc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1
      FROM public.user_location_access a
      JOIN public.users u ON u.id = a.user_id
      JOIN public.locations l ON l.id = a.location_id
      WHERE a.user_id = (SELECT auth.uid())
        AND a.location_id = loc_id
        AND u.status = 'ACTIVE'
        AND (
          u.role <> 'EVENT_MANAGER'
          OR l.type IN (
            'TEMPORARY_EVENT',
            'EXHIBITION',
            'POPUP',
            'OUTDOOR_EVENT',
            'ACTIVATION'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_wide_reader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND status = 'ACTIVE'
      AND role = 'MARKETING'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_content_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
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
    WHERE id = (SELECT auth.uid())
      AND status = 'ACTIVE'
      AND role IN ('SUPER_ADMIN', 'MARKETING', 'SITE_SUPERVISOR')
  );
$$;

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
  WHERE a.user_id = (SELECT auth.uid())
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
    WHERE id = (SELECT auth.uid())
      AND status = 'ACTIVE'
      AND role IN ('SITE_SUPERVISOR', 'EVENT_MANAGER')
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

CREATE OR REPLACE FUNCTION public.can_read_screen(p_screen_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.screens s
    WHERE s.id = p_screen_id
      AND (
        (SELECT public.is_super_admin())
        OR public.has_location_access(s.location_id)
        OR (SELECT public.is_org_wide_reader())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies: same rules, InitPlan-friendly wrappers
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS users_read_self_or_admin ON public.users;
CREATE POLICY users_read_self_or_admin ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_super_admin()));

DROP POLICY IF EXISTS users_insert_admin ON public.users;
CREATE POLICY users_insert_admin ON public.users
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS users_update_admin ON public.users;
CREATE POLICY users_update_admin ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS ula_read ON public.user_location_access;
CREATE POLICY ula_read ON public.user_location_access
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_super_admin()));

DROP POLICY IF EXISTS ula_write_admin ON public.user_location_access;
CREATE POLICY ula_write_admin ON public.user_location_access
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS org_read_member ON public.organizations;
CREATE POLICY org_read_member ON public.organizations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = organizations.id
    )
  );

DROP POLICY IF EXISTS org_write_admin ON public.organizations;
CREATE POLICY org_write_admin ON public.organizations
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS org_settings_read ON public.organization_settings;
CREATE POLICY org_settings_read ON public.organization_settings
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = organization_settings.organization_id
    )
  );

DROP POLICY IF EXISTS org_settings_write_admin ON public.organization_settings;
CREATE POLICY org_settings_write_admin ON public.organization_settings
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS locations_read ON public.locations;
CREATE POLICY locations_read ON public.locations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR public.has_location_access(id)
    OR (
      (SELECT public.is_org_wide_reader())
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (SELECT auth.uid())
          AND u.status = 'ACTIVE'
          AND u.organization_id = locations.organization_id
      )
    )
  );

DROP POLICY IF EXISTS locations_write_admin ON public.locations;
CREATE POLICY locations_write_admin ON public.locations
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS screens_read ON public.screens;
CREATE POLICY screens_read ON public.screens
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR public.has_location_access(location_id)
    OR (
      (SELECT public.is_org_wide_reader())
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (SELECT auth.uid())
          AND u.status = 'ACTIVE'
          AND u.organization_id = screens.organization_id
      )
    )
  );

DROP POLICY IF EXISTS screens_write ON public.screens;
CREATE POLICY screens_write ON public.screens
  FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()) OR public.has_location_access(location_id))
  WITH CHECK ((SELECT public.is_super_admin()) OR public.has_location_access(location_id));

DROP POLICY IF EXISTS screen_groups_read ON public.screen_groups;
CREATE POLICY screen_groups_read ON public.screen_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = screen_groups.organization_id
    )
  );

DROP POLICY IF EXISTS screen_groups_write ON public.screen_groups;
CREATE POLICY screen_groups_write ON public.screen_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = screen_groups.organization_id
        AND u.role = ANY (ARRAY[
          'SUPER_ADMIN'::public.user_role,
          'MARKETING'::public.user_role,
          'SITE_SUPERVISOR'::public.user_role,
          'EVENT_MANAGER'::public.user_role
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = screen_groups.organization_id
        AND u.role = ANY (ARRAY[
          'SUPER_ADMIN'::public.user_role,
          'MARKETING'::public.user_role,
          'SITE_SUPERVISOR'::public.user_role,
          'EVENT_MANAGER'::public.user_role
        ])
    )
  );

DROP POLICY IF EXISTS screen_group_members_read ON public.screen_group_members;
CREATE POLICY screen_group_members_read ON public.screen_group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = screen_group_members.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
        )
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
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = screen_group_members.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
        )
    )
  );

DROP POLICY IF EXISTS media_read ON public.media;
CREATE POLICY media_read ON public.media
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.is_org_wide_reader())
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (SELECT auth.uid())
          AND u.status = 'ACTIVE'
          AND u.organization_id = media.organization_id
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (SELECT auth.uid())
          AND u.status = 'ACTIVE'
          AND u.organization_id = media.organization_id
      )
      AND (
        media.created_by = (SELECT auth.uid())
        OR media.uploaded_by = (SELECT auth.uid())
        OR media.location_ids && (SELECT public.current_user_location_ids())
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
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR media.created_by = (SELECT auth.uid())
      OR media.uploaded_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR media.created_by = (SELECT auth.uid())
      OR media.uploaded_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS media_folders_read ON public.media_folders;
CREATE POLICY media_folders_read ON public.media_folders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
        AND (
          (SELECT public.is_content_editor())
          OR (SELECT public.is_super_admin())
        )
    )
  );

DROP POLICY IF EXISTS media_folders_write ON public.media_folders;
CREATE POLICY media_folders_write ON public.media_folders
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
    )
  );

DROP POLICY IF EXISTS media_versions_write ON public.media_versions;
CREATE POLICY media_versions_write ON public.media_versions
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.media m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE m.id = media_versions.media_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.media m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE m.id = media_versions.media_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS org_member_read_playlists ON public.playlists;
CREATE POLICY org_member_read_playlists ON public.playlists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
        AND (
          NOT (SELECT public.is_location_scoped_user())
          OR playlists.created_by = (SELECT auth.uid())
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
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR playlists.created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR playlists.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS playlist_items_write ON public.playlist_items;
CREATE POLICY playlist_items_write ON public.playlist_items
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.playlists p
      JOIN public.users u ON u.organization_id = p.organization_id
      WHERE p.id = playlist_items.playlist_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.playlists p
      JOIN public.users u ON u.organization_id = p.organization_id
      WHERE p.id = playlist_items.playlist_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS org_member_read_layouts ON public.layouts;
CREATE POLICY org_member_read_layouts ON public.layouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
        AND (
          NOT (SELECT public.is_location_scoped_user())
          OR layouts.created_by = (SELECT auth.uid())
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
    (SELECT public.is_layout_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR layouts.created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.is_layout_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR layouts.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS layout_zones_write ON public.layout_zones;
CREATE POLICY layout_zones_write ON public.layout_zones
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_layout_editor())
    AND EXISTS (
      SELECT 1
      FROM public.layouts l
      JOIN public.users u ON u.organization_id = l.organization_id
      WHERE l.id = layout_zones.layout_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    (SELECT public.is_layout_editor())
    AND EXISTS (
      SELECT 1
      FROM public.layouts l
      JOIN public.users u ON u.organization_id = l.organization_id
      WHERE l.id = layout_zones.layout_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS campaigns_read ON public.campaigns;
CREATE POLICY campaigns_read ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
        AND (
          NOT (SELECT public.is_location_scoped_user())
          OR campaigns.created_by = (SELECT auth.uid())
          OR public.campaign_intersects_user_locations(campaigns.id)
        )
    )
  );

DROP POLICY IF EXISTS campaigns_write ON public.campaigns;
CREATE POLICY campaigns_write ON public.campaigns
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR campaigns.created_by = (SELECT auth.uid())
      OR public.campaign_intersects_user_locations(campaigns.id)
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
    )
    AND (
      NOT (SELECT public.is_location_scoped_user())
      OR campaigns.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS campaign_targets_write ON public.campaign_targets;
CREATE POLICY campaign_targets_write ON public.campaign_targets
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = campaign_targets.campaign_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = campaign_targets.campaign_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS schedules_write ON public.schedules;
CREATE POLICY schedules_write ON public.schedules
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = schedules.campaign_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = schedules.campaign_id
        AND u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS content_manifests_read ON public.content_manifests;
CREATE POLICY content_manifests_read ON public.content_manifests
  FOR SELECT TO authenticated
  USING ((SELECT public.can_read_screen(screen_id)));

DROP POLICY IF EXISTS manifest_assets_read ON public.manifest_assets;
CREATE POLICY manifest_assets_read ON public.manifest_assets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_manifests m
      WHERE m.id = manifest_assets.manifest_id
        AND (SELECT public.can_read_screen(m.screen_id))
    )
  );

DROP POLICY IF EXISTS download_status_read ON public.device_download_status;
CREATE POLICY download_status_read ON public.device_download_status
  FOR SELECT TO authenticated
  USING ((SELECT public.can_read_screen(screen_id)));

DROP POLICY IF EXISTS sync_state_read ON public.device_sync_states;
CREATE POLICY sync_state_read ON public.device_sync_states
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
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
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
        )
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
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
        )
    )
  );

DROP POLICY IF EXISTS playback_logs_read ON public.playback_logs;
CREATE POLICY playback_logs_read ON public.playback_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = playback_logs.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
        )
    )
  );

DROP POLICY IF EXISTS sync_events_read ON public.sync_events;
CREATE POLICY sync_events_read ON public.sync_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = sync_events.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
        )
    )
  );

DROP POLICY IF EXISTS system_logs_admin_read ON public.system_logs;
CREATE POLICY system_logs_admin_read ON public.system_logs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));

DROP POLICY IF EXISTS system_logs_device_read ON public.system_logs;
CREATE POLICY system_logs_device_read ON public.system_logs
  FOR SELECT TO authenticated
  USING (
    source = 'device'
    AND EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id::text = (system_logs.context ->> 'screenId')
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
          OR (SELECT public.is_org_wide_reader())
        )
    )
  );

DROP POLICY IF EXISTS audit_read_admin ON public.audit_logs;
CREATE POLICY audit_read_admin ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Duplicate indexes (identical definitions)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.heartbeats_screen_received_idx;
DROP INDEX IF EXISTS public.device_tokens_screen_idx;

NOTIFY pgrst, 'reload schema';
