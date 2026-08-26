-- Phase 6: persist playlists and layouts.
-- Content editors can write playlists/items. Layout writes are Super Admin + Marketing
-- (Event Managers can view layouts). Pixel snapshot stored on layouts.device_json at save.

ALTER TABLE public.layouts
  ADD COLUMN IF NOT EXISTS device_json jsonb;

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
      AND role IN ('SUPER_ADMIN', 'MARKETING')
  );
$$;

REVOKE ALL ON FUNCTION public.is_layout_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_layout_editor() TO authenticated;

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
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = playlists.organization_id
    )
  );

DROP POLICY IF EXISTS playlist_items_write ON public.playlist_items;
CREATE POLICY playlist_items_write ON public.playlist_items
  FOR ALL TO authenticated
  USING (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      JOIN public.users u ON u.organization_id = p.organization_id
      WHERE p.id = playlist_items.playlist_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    public.is_content_editor()
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      JOIN public.users u ON u.organization_id = p.organization_id
      WHERE p.id = playlist_items.playlist_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
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
  )
  WITH CHECK (
    public.is_layout_editor()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.status = 'ACTIVE'
        AND u.organization_id = layouts.organization_id
    )
  );

DROP POLICY IF EXISTS layout_zones_write ON public.layout_zones;
CREATE POLICY layout_zones_write ON public.layout_zones
  FOR ALL TO authenticated
  USING (
    public.is_layout_editor()
    AND EXISTS (
      SELECT 1 FROM public.layouts l
      JOIN public.users u ON u.organization_id = l.organization_id
      WHERE l.id = layout_zones.layout_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    public.is_layout_editor()
    AND EXISTS (
      SELECT 1 FROM public.layouts l
      JOIN public.users u ON u.organization_id = l.organization_id
      WHERE l.id = layout_zones.layout_id
        AND u.id = auth.uid()
        AND u.status = 'ACTIVE'
    )
  );
