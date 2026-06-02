-- Add World Cup pool support

-- 1. pools: add game_type, teams_per_manager, scoring_config; make conferences nullable
alter table public.pools
  add column game_type text not null default 'cfb'
    check (game_type in ('cfb', 'world_cup')),
  add column teams_per_manager int,
  add column scoring_config jsonb;

alter table public.pools
  alter column conferences drop not null,
  alter column conferences set default null;

-- 2. draft_picks: make conference_key nullable for WC picks
alter table public.draft_picks
  alter column conference_key drop not null;

-- 3. cached_teams: add game_type discriminator
alter table public.cached_teams
  add column game_type text not null default 'cfb'
    check (game_type in ('cfb', 'world_cup'));

create index idx_cached_teams_game_type
  on public.cached_teams(game_type, season_year);

-- 4. cached_games: add WC-specific fields
alter table public.cached_games
  add column game_type text not null default 'cfb'
    check (game_type in ('cfb', 'world_cup')),
  add column stage text,
  add column is_overtime boolean not null default false,
  add column is_shootout boolean not null default false,
  add column home_penalty_score int,
  add column away_penalty_score int,
  add column manual_entry boolean not null default false;

-- Make week nullable for WC games (they use stage instead)
alter table public.cached_games
  alter column week drop not null;

create index idx_cached_games_game_type
  on public.cached_games(game_type, season_year);
