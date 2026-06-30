-- Add font color fields for pool cards
ALTER TABLE public.pools
  ADD COLUMN font_color text,
  ADD COLUMN subfont_color text;
