-- Phase 8: device REST supporting indexes.
-- Pairing codes and device tokens stay service-role-only (existing RLS).
-- Heartbeats, playback logs, and manifests are written with the service role.

CREATE INDEX IF NOT EXISTS device_heartbeats_screen_received_idx
  ON public.device_heartbeats (screen_id, received_at DESC);

CREATE INDEX IF NOT EXISTS system_logs_created_idx
  ON public.system_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS device_tokens_screen_idx
  ON public.device_tokens (screen_id)
  WHERE revoked_at IS NULL;
