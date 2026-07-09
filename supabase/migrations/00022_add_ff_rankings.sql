-- Player rankings from public sources (ESPN, Yahoo, Sleeper, FantasyPros)
-- plus a composite index, and a site-admin flag for the rankings admin page.

-- Site admin flag (writes only via service role; no RLS policy changes needed)
alter table public.profiles
  add column is_site_admin boolean not null default false;

-- Per-source ranks (manually editable by site admins) + computed composite.
-- default_rank remains the effective draft order and is reassigned from
-- rank_composite whenever rankings change.
alter table public.ff_players
  add column rank_espn int,
  add column rank_yahoo int,
  add column rank_sleeper int,
  add column rank_fantasypros int,
  add column rank_composite real;
