-- Clear stale 2026 World Cup cached teams so the API repopulates
-- from the corrected static data (official FIFA draw, Dec 5 2025).
-- Removes 12 non-qualified teams and outdated group assignments.
DELETE FROM cached_teams
WHERE game_type = 'world_cup'
  AND season_year = 2026;
