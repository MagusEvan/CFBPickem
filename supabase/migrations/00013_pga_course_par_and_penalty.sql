-- Add course par and missed-cut penalty score to PGA tournaments
ALTER TABLE public.pga_tournaments
  ADD COLUMN course_par integer NOT NULL DEFAULT 72,
  ADD COLUMN missed_cut_score integer NOT NULL DEFAULT 80;
