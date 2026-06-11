-- Add status_detail column for live game clock/period info from ESPN
alter table public.cached_games
  add column if not exists status_detail text default null;
