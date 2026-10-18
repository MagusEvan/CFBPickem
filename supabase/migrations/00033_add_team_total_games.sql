-- Total scheduled games per team (regular season), populated from ESPN.
-- Used for Games Remaining = total_games - (wins + losses).
alter table public.cached_teams
  add column total_games int;
