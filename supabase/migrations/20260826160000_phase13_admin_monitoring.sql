-- Phase 13: admin monitoring from real heartbeats / sync acks / proof-of-play.
-- Authenticated CMS roles can read sync events and device error logs for screens
-- they can already see. Reporting RPCs run as invoker so RLS still applies.

DROP POLICY IF EXISTS sync_events_read ON public.sync_events;
CREATE POLICY sync_events_read ON public.sync_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id = sync_events.screen_id
        AND (
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
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
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
        )
    )
  );

DROP POLICY IF EXISTS system_logs_device_read ON public.system_logs;
CREATE POLICY system_logs_device_read ON public.system_logs
  FOR SELECT TO authenticated
  USING (
    source = 'device'
    AND EXISTS (
      SELECT 1 FROM public.screens s
      WHERE s.id::text = system_logs.context->>'screenId'
        AND (
          public.is_super_admin()
          OR public.has_location_access(s.location_id)
          OR public.is_org_wide_reader()
        )
    )
  );

CREATE INDEX IF NOT EXISTS playback_logs_campaign_started_idx
  ON public.playback_logs (campaign_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.heartbeat_coverage_since(p_since timestamptz)
RETURNS TABLE (screen_id uuid, heartbeat_count bigint, last_received timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    device_heartbeats.screen_id,
    count(*)::bigint AS heartbeat_count,
    max(device_heartbeats.received_at) AS last_received
  FROM public.device_heartbeats
  WHERE device_heartbeats.received_at >= p_since
  GROUP BY device_heartbeats.screen_id
$$;

CREATE OR REPLACE FUNCTION public.proof_of_play_since(p_since timestamptz)
RETURNS TABLE (
  day date,
  screen_id uuid,
  campaign_id uuid,
  playlist_id uuid,
  media_id uuid,
  play_count bigint,
  total_duration_ms bigint,
  completed_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (playback_logs.started_at AT TIME ZONE 'utc')::date AS day,
    playback_logs.screen_id,
    playback_logs.campaign_id,
    playback_logs.playlist_id,
    playback_logs.media_id,
    count(*)::bigint AS play_count,
    coalesce(sum(playback_logs.duration_ms), 0)::bigint AS total_duration_ms,
    count(*) FILTER (WHERE playback_logs.result = 'COMPLETED')::bigint AS completed_count
  FROM public.playback_logs
  WHERE playback_logs.started_at >= p_since
  GROUP BY 1, 2, 3, 4, 5
$$;

REVOKE ALL ON FUNCTION public.heartbeat_coverage_since(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proof_of_play_since(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_coverage_since(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proof_of_play_since(timestamptz) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_events';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
