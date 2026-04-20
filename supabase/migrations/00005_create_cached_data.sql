-- Cached teams from external APIs
create table public.cached_teams (
  id text not null,
  name text not null,
  abbreviation text not null default '',
  conference_key text references public.conferences(key),
  logo_url text,
  color_primary text,
  color_secondary text,
  season_year int not null,
  wins int not null default 0,
  losses int not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (id, season_year)
);

-- Cached games / schedule
create table public.cached_games (
  id text primary key,
  season_year int not null,
  week int not null,
  home_team_id text not null,
  away_team_id text not null,
  home_score int,
  away_score int,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'final')),
  start_time timestamptz,
  venue text,
  fetched_at timestamptz not null default now()
);

-- Indexes for common queries
create index idx_cached_teams_conference on public.cached_teams(conference_key, season_year);
create index idx_cached_games_week on public.cached_games(season_year, week);
create index idx_cached_games_teams on public.cached_games(home_team_id, away_team_id);

-- RLS: readable by all authenticated users
alter table public.cached_teams enable row level security;
alter table public.cached_games enable row level security;

create policy "Anyone can view cached teams"
  on public.cached_teams for select
  to authenticated
  using (true);

create policy "Anyone can view cached games"
  on public.cached_games for select
  to authenticated
  using (true);
