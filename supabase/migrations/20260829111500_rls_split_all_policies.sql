-- Performance Advisor: Multiple Permissive Policies.
-- FOR ALL includes SELECT, so a dedicated FOR SELECT + FOR ALL on the same
-- role ORs two SELECT paths per row. Split write policies into INSERT /
-- UPDATE / DELETE only; keep a single SELECT. Merge system_logs dual SELECTs.
-- Semantics and InitPlan wrappers from 20260828210000 are preserved.

-- ---------------------------------------------------------------------------
-- user_location_access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ula_write_admin ON public.user_location_access;
CREATE POLICY ula_insert_admin ON public.user_location_access
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY ula_update_admin ON public.user_location_access
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY ula_delete_admin ON public.user_location_access
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_write_admin ON public.organizations;
CREATE POLICY org_insert_admin ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY org_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY org_delete_admin ON public.organizations
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- organization_settings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_settings_write_admin ON public.organization_settings;
CREATE POLICY org_settings_insert_admin ON public.organization_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY org_settings_update_admin ON public.organization_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY org_settings_delete_admin ON public.organization_settings
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS locations_write_admin ON public.locations;
CREATE POLICY locations_insert_admin ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY locations_update_admin ON public.locations
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
CREATE POLICY locations_delete_admin ON public.locations
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- screens
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS screens_write ON public.screens;
CREATE POLICY screens_insert ON public.screens
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()) OR public.has_location_access(location_id));
CREATE POLICY screens_update ON public.screens
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()) OR public.has_location_access(location_id))
  WITH CHECK ((SELECT public.is_super_admin()) OR public.has_location_access(location_id));
CREATE POLICY screens_delete ON public.screens
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()) OR public.has_location_access(location_id));

-- ---------------------------------------------------------------------------
-- screen_groups
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS screen_groups_write ON public.screen_groups;
CREATE POLICY screen_groups_insert ON public.screen_groups
  FOR INSERT TO authenticated
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
CREATE POLICY screen_groups_update ON public.screen_groups
  FOR UPDATE TO authenticated
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
CREATE POLICY screen_groups_delete ON public.screen_groups
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- screen_group_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS screen_group_members_write ON public.screen_group_members;
CREATE POLICY screen_group_members_insert ON public.screen_group_members
  FOR INSERT TO authenticated
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
CREATE POLICY screen_group_members_update ON public.screen_group_members
  FOR UPDATE TO authenticated
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
CREATE POLICY screen_group_members_delete ON public.screen_group_members
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS media_write_content_roles ON public.media;
CREATE POLICY media_insert_content_roles ON public.media
  FOR INSERT TO authenticated
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
CREATE POLICY media_update_content_roles ON public.media
  FOR UPDATE TO authenticated
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
CREATE POLICY media_delete_content_roles ON public.media
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- media_folders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS media_folders_write ON public.media_folders;
CREATE POLICY media_folders_insert ON public.media_folders
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
    )
  );
CREATE POLICY media_folders_update ON public.media_folders
  FOR UPDATE TO authenticated
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
CREATE POLICY media_folders_delete ON public.media_folders
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_content_editor())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'ACTIVE'
        AND u.organization_id = media_folders.organization_id
    )
  );

-- ---------------------------------------------------------------------------
-- media_versions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS media_versions_write ON public.media_versions;
CREATE POLICY media_versions_insert ON public.media_versions
  FOR INSERT TO authenticated
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
CREATE POLICY media_versions_update ON public.media_versions
  FOR UPDATE TO authenticated
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
CREATE POLICY media_versions_delete ON public.media_versions
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- playlists
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS playlists_write ON public.playlists;
CREATE POLICY playlists_insert ON public.playlists
  FOR INSERT TO authenticated
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
CREATE POLICY playlists_update ON public.playlists
  FOR UPDATE TO authenticated
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
CREATE POLICY playlists_delete ON public.playlists
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- playlist_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS playlist_items_write ON public.playlist_items;
CREATE POLICY playlist_items_insert ON public.playlist_items
  FOR INSERT TO authenticated
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
CREATE POLICY playlist_items_update ON public.playlist_items
  FOR UPDATE TO authenticated
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
CREATE POLICY playlist_items_delete ON public.playlist_items
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- layouts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS layouts_write ON public.layouts;
CREATE POLICY layouts_insert ON public.layouts
  FOR INSERT TO authenticated
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
CREATE POLICY layouts_update ON public.layouts
  FOR UPDATE TO authenticated
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
CREATE POLICY layouts_delete ON public.layouts
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- layout_zones
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS layout_zones_write ON public.layout_zones;
CREATE POLICY layout_zones_insert ON public.layout_zones
  FOR INSERT TO authenticated
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
CREATE POLICY layout_zones_update ON public.layout_zones
  FOR UPDATE TO authenticated
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
CREATE POLICY layout_zones_delete ON public.layout_zones
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS campaigns_write ON public.campaigns;
CREATE POLICY campaigns_insert ON public.campaigns
  FOR INSERT TO authenticated
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
CREATE POLICY campaigns_update ON public.campaigns
  FOR UPDATE TO authenticated
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
CREATE POLICY campaigns_delete ON public.campaigns
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- campaign_targets
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS campaign_targets_write ON public.campaign_targets;
CREATE POLICY campaign_targets_insert ON public.campaign_targets
  FOR INSERT TO authenticated
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
CREATE POLICY campaign_targets_update ON public.campaign_targets
  FOR UPDATE TO authenticated
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
CREATE POLICY campaign_targets_delete ON public.campaign_targets
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS schedules_write ON public.schedules;
CREATE POLICY schedules_insert ON public.schedules
  FOR INSERT TO authenticated
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
CREATE POLICY schedules_update ON public.schedules
  FOR UPDATE TO authenticated
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
CREATE POLICY schedules_delete ON public.schedules
  FOR DELETE TO authenticated
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
  );

-- ---------------------------------------------------------------------------
-- device_sync_states
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS sync_state_write ON public.device_sync_states;
CREATE POLICY sync_state_insert ON public.device_sync_states
  FOR INSERT TO authenticated
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
CREATE POLICY sync_state_update ON public.device_sync_states
  FOR UPDATE TO authenticated
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
CREATE POLICY sync_state_delete ON public.device_sync_states
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (
          (SELECT public.is_super_admin())
          OR public.has_location_access(s.location_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- system_logs: merge two permissive SELECT policies into one OR expression
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS system_logs_admin_read ON public.system_logs;
DROP POLICY IF EXISTS system_logs_device_read ON public.system_logs;
CREATE POLICY system_logs_read ON public.system_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (
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
    )
  );

NOTIFY pgrst, 'reload schema';
