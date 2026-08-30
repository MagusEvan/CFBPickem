-- Store team names directly on games so FCS/non-cached teams display properly.
alter table public.cached_games
  add column home_team_name text,
  add column away_team_name text;
