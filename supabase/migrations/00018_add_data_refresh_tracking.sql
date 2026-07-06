-- Tracks last refresh time per external-data resource (e.g. 'games:cfb:2026',
-- 'golfers:<tournament_id>'). Used to gate and deduplicate ESPN fetches:
-- a request "claims" a refresh via a conditional update, so at most one
-- fetch runs per resource per staleness window regardless of traffic.

create table public.data_refresh (
  resource text primary key,
  -- epoch default so a freshly inserted row is immediately claimable
  last_refreshed_at timestamptz not null default to_timestamp(0)
);

-- Only the service-role admin client touches this table; no policies needed.
alter table public.data_refresh enable row level security;
