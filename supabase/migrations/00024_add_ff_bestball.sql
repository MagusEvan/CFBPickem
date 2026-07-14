-- Fantasy football best ball: a fifth game type reusing all ff_* tables.
-- Draft-only — no lineups, waivers, or trades; weekly scores are computed
-- on-read as each roster's optimal lineup.
alter table public.pools drop constraint pools_game_type_check;
alter table public.pools add constraint pools_game_type_check
  check (game_type in ('cfb', 'world_cup', 'pga', 'ff', 'ff_bestball'));
