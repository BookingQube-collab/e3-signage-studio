-- Direct-created CMS users can sign in with username + password and no email.
-- Email stays unique per org when present; username is globally unique (case-insensitive).

ALTER TABLE public.users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;
