-- Phase 14: hardening — durable rate-limit buckets, overlapping device tokens,
-- RLS coverage for manifests / download status / admin system logs.

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

DROP INDEX IF EXISTS device_tokens_one_active_per_screen;

CREATE INDEX IF NOT EXISTS device_tokens_live_screen_idx
  ON public.device_tokens (screen_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limit_no_client ON public.rate_limit_buckets;
CREATE POLICY rate_limit_no_client ON public.rate_limit_buckets
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_buckets TO service_role;
REVOKE ALL ON TABLE public.device_tokens FROM anon;
REVOKE ALL ON TABLE public.device_pairing_codes FROM anon;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.rate_limit_buckets;
  allowed boolean;
  retry integer;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR p_limit < 1 OR p_window_seconds < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'retryAfterSeconds', p_window_seconds, 'hitCount', 0);
  END IF;

  INSERT INTO public.rate_limit_buckets (bucket_key, window_start, hit_count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
  SET
    hit_count = CASE
      WHEN rate_limit_buckets.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE rate_limit_buckets.hit_count + 1
    END,
    window_start = CASE
      WHEN rate_limit_buckets.window_start <= now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE rate_limit_buckets.window_start
    END
  RETURNING * INTO rec;

  allowed := rec.hit_count <= p_limit;
  retry := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (rec.window_start + make_interval(secs => p_window_seconds) - now())))::integer
  );
  RETURN jsonb_build_object(
    'allowed', allowed,
    'retryAfterSeconds', retry,
    'hitCount', rec.hit_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

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
        public.is_super_admin()
        OR public.has_location_access(s.location_id)
        OR public.is_org_wide_reader()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_screen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_screen(uuid) TO authenticated;

DROP POLICY IF EXISTS content_manifests_read ON public.content_manifests;
CREATE POLICY content_manifests_read ON public.content_manifests
  FOR SELECT TO authenticated
  USING (public.can_read_screen(screen_id));

DROP POLICY IF EXISTS manifest_assets_read ON public.manifest_assets;
CREATE POLICY manifest_assets_read ON public.manifest_assets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_manifests m
      WHERE m.id = manifest_assets.manifest_id
        AND public.can_read_screen(m.screen_id)
    )
  );

DROP POLICY IF EXISTS download_status_read ON public.device_download_status;
CREATE POLICY download_status_read ON public.device_download_status
  FOR SELECT TO authenticated
  USING (public.can_read_screen(screen_id));

DROP POLICY IF EXISTS system_logs_admin_read ON public.system_logs;
CREATE POLICY system_logs_admin_read ON public.system_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS pairing_no_client ON public.device_pairing_codes;
CREATE POLICY pairing_no_client ON public.device_pairing_codes
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS device_tokens_no_client ON public.device_tokens;
CREATE POLICY device_tokens_no_client ON public.device_tokens
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
