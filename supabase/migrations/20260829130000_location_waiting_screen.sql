-- Per-location default / waiting screen override for TV players.
-- When waiting_media_id is set, paired screens at that location use this image
-- instead of the organization default. Null keeps org → built-in fallback.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS waiting_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waiting_title text,
  ADD COLUMN IF NOT EXISTS waiting_message text,
  ADD COLUMN IF NOT EXISTS waiting_config_version integer NOT NULL DEFAULT 1
    CHECK (waiting_config_version >= 1);

COMMENT ON COLUMN public.locations.waiting_media_id IS
  'Optional media library image used as the waiting/idle screen for screens at this location. Null inherits organization default.';
COMMENT ON COLUMN public.locations.waiting_title IS
  'Optional waiting-screen headline for this location. Null inherits organization title when a location image is set.';
COMMENT ON COLUMN public.locations.waiting_message IS
  'Optional waiting-screen body text for this location. Null inherits organization message when a location image is set.';
COMMENT ON COLUMN public.locations.waiting_config_version IS
  'Bumped when this location waiting-screen override changes so devices refresh cached idle assets.';

CREATE INDEX IF NOT EXISTS locations_waiting_media_id_idx
  ON public.locations (waiting_media_id)
  WHERE waiting_media_id IS NOT NULL;
