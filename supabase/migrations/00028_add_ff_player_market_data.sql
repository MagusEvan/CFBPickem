-- Market data already present in the ranking-source payloads but previously
-- discarded: ADP, auction values, ownership %, season projections (ESPN),
-- tiers/position ranks (FantasyPros), injury notes + depth charts (Sleeper).
-- Populated by refreshRankingsFromSources; display-only, so no indexes.

alter table public.ff_players
  add column adp real,
  add column auction_value real,
  add column percent_owned real,
  add column proj_season_pts real,
  add column tier int,
  add column pos_rank text,
  add column injury_note text,
  add column depth_chart_position text,
  add column depth_chart_order int,
  add column news_updated timestamptz;

-- SECURITY: the permissive "Users can update own profile" policy (00001) has
-- no column restrictions, and profiles has since gained privileged columns
-- (is_site_admin in 00022, pool_limit_override in 00025). Without this guard
-- any authenticated user could PATCH their own row to is_site_admin = true
-- via PostgREST. PostgREST runs end-user requests as the `authenticated` /
-- `anon` roles; service-role requests and SQL-editor sessions (postgres) run
-- as other roles and stay unrestricted, so the DB bootstrap path still works.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.is_site_admin is distinct from old.is_site_admin then
      raise exception 'is_site_admin can only be changed by an administrator';
    end if;
    if new.pool_limit_override is distinct from old.pool_limit_override then
      raise exception 'pool_limit_override can only be changed by an administrator';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_escalation();
