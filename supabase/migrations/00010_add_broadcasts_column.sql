-- Add broadcasts column to cached_games for TV/streaming info
alter table public.cached_games
  add column if not exists broadcasts jsonb default null;

comment on column public.cached_games.broadcasts is
  'Array of {network, type, market, locale} objects from ESPN geoBroadcasts';
