-- Allow multiple scraps teams per conference (e.g. when filling up scraps
-- with best remaining teams regardless of conference).
alter table public.team_scraps drop constraint team_scraps_pool_id_conference_key_key;
