-- Ongoing / evergreen campaigns have no start or end date.
-- Daily play hours and days_of_week still apply.

DO $$
DECLARE
  conname text;
BEGIN
  FOR conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'schedules'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%end_date%start_date%'
  LOOP
    EXECUTE format('ALTER TABLE public.schedules DROP CONSTRAINT %I', conname);
  END LOOP;
END $$;

ALTER TABLE public.schedules
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_open_or_ordered_dates
  CHECK (
    (start_date IS NULL AND end_date IS NULL)
    OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
  );
