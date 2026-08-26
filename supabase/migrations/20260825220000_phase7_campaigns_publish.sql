-- Phase 7: campaign persistence, schedules, publish writes.
-- Org-scoped campaign read. Content editors write campaigns, targets, and schedules.
-- Manifests / sync events are written with the service role from the publish engine.

DROP POLICY IF EXISTS campaigns_read ON public.campaigns;
CREATE POLICY campaigns_read ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
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
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = campaigns.organization_id
    )
  );

DROP POLICY IF EXISTS campaign_targets_write ON public.campaign_targets;
CREATE POLICY campaign_targets_write ON public.campaign_targets
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = campaign_targets.campaign_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = campaign_targets.campaign_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS schedules_write ON public.schedules;
CREATE POLICY schedules_write ON public.schedules
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = schedules.campaign_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.users u ON u.organization_id = c.organization_id
      WHERE c.id = schedules.campaign_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  );

-- Marketing can read fleet sync state the same way they can read screens.
DROP POLICY IF EXISTS sync_state_read ON public.device_sync_states;
CREATE POLICY sync_state_read ON public.device_sync_states
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = device_sync_states.screen_id
        AND (
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
        )
    )
  );
