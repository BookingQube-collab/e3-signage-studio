-- Admin-managed default / waiting screen for TVs with no ACTIVE package.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS default_waiting_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_waiting_title text,
  ADD COLUMN IF NOT EXISTS default_waiting_message text,
  ADD COLUMN IF NOT EXISTS waiting_config_version integer NOT NULL DEFAULT 1
    CHECK (waiting_config_version >= 1);

COMMENT ON COLUMN public.organization_settings.default_waiting_media_id IS
  'Optional media library image shown on paired TVs while waiting for published content.';
COMMENT ON COLUMN public.organization_settings.default_waiting_title IS
  'Optional headline on the waiting screen. Null keeps the built-in E3 copy.';
COMMENT ON COLUMN public.organization_settings.default_waiting_message IS
  'Optional body text on the waiting screen. Null keeps the built-in E3 copy.';
COMMENT ON COLUMN public.organization_settings.waiting_config_version IS
  'Bumped when waiting-screen defaults change so devices refresh cached idle assets.';
