-- Sportsbook season win totals for CFB teams (ingested from public odds
-- pages, e.g. VegasInsider's DraftKings column) plus a per-draft flag that
-- lets the pool admin flash projections to every drafter in realtime.

alter table public.cached_teams
  add column projected_wins numeric(4,1);

alter table public.draft_state
  add column show_projections boolean not null default false;
