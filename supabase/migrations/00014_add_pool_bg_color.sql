-- Add background color for pool cards on the /pools page
ALTER TABLE public.pools
  ADD COLUMN bg_color text;
