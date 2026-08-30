-- Optional MP3 soundtrack on image playlist items.
-- Soundtrack files are stored as media rows with type AUDIO.

ALTER TYPE public.media_type ADD VALUE IF NOT EXISTS 'AUDIO';

ALTER TABLE public.playlist_items
  ADD COLUMN IF NOT EXISTS audio_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS audio_media_version_id uuid REFERENCES public.media_versions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS playlist_items_audio_media_idx
  ON public.playlist_items (audio_media_id)
  WHERE audio_media_id IS NOT NULL;
