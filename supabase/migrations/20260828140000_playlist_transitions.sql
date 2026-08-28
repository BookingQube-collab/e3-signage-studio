-- Extra enter transitions for playlist items. Existing CUT/FADE/SLIDE/ZOOM/NONE stay valid.
ALTER TYPE public.transition ADD VALUE IF NOT EXISTS 'SLIDE_RIGHT';
ALTER TYPE public.transition ADD VALUE IF NOT EXISTS 'SLIDE_UP';
ALTER TYPE public.transition ADD VALUE IF NOT EXISTS 'SLIDE_DOWN';
ALTER TYPE public.transition ADD VALUE IF NOT EXISTS 'WIPE';
ALTER TYPE public.transition ADD VALUE IF NOT EXISTS 'DISSOLVE';
