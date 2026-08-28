-- On-screen waiting brand: built-in full logo (default), E3 icon, or custom media image.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS default_waiting_brand text NOT NULL DEFAULT 'FULL_LOGO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_settings_default_waiting_brand_check'
  ) THEN
    ALTER TABLE public.organization_settings
      ADD CONSTRAINT organization_settings_default_waiting_brand_check
      CHECK (default_waiting_brand IN ('FULL_LOGO', 'ICON', 'CUSTOM'));
  END IF;
END $$;

COMMENT ON COLUMN public.organization_settings.default_waiting_brand IS
  'Waiting-screen brand mark: FULL_LOGO (default), ICON, or CUSTOM (uses default_waiting_media_id).';
