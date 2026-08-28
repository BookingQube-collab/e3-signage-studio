-- Admin-managed CMS + player branding assets (logo, favicon, in-app icon, APK rebuild icon).

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS cms_logo_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cms_favicon_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS player_brand_icon_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apk_launcher_icon_media_id uuid REFERENCES public.media (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branding_config_version integer NOT NULL DEFAULT 1
    CHECK (branding_config_version >= 1);

COMMENT ON COLUMN public.organization_settings.cms_logo_media_id IS
  'Optional media library image used as the CMS brand mark (sidebar, login, headers).';
COMMENT ON COLUMN public.organization_settings.cms_favicon_media_id IS
  'Optional media library image used as the CMS site favicon.';
COMMENT ON COLUMN public.organization_settings.player_brand_icon_media_id IS
  'Optional in-app brand icon synced to TV players (waiting / idle screens). Does not change the Android launcher icon at runtime.';
COMMENT ON COLUMN public.organization_settings.apk_launcher_icon_media_id IS
  'Reference image for rebuilding the Android TV APK launcher icon. Changing this does not update installed apps until a new APK is built and installed.';
COMMENT ON COLUMN public.organization_settings.branding_config_version IS
  'Bumped when CMS branding assets change so clients can refresh cached logo/favicon URLs.';
