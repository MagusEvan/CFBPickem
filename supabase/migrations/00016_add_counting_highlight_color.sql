-- Add counting score highlight color for PGA leaderboard cells
ALTER TABLE public.pools
  ADD COLUMN counting_highlight_color text;
