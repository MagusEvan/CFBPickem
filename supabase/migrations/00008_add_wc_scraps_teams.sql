-- World Cup scraps teams: groups of undrafted national teams
-- that compete alongside managers in standings.
create table public.wc_scraps_teams (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  scraps_team_number int not null,
  team_id text not null,
  team_name text not null,
  created_at timestamptz not null default now(),
  unique (pool_id, scraps_team_number, team_id)
);

alter table public.wc_scraps_teams enable row level security;

create policy "Pool members can view WC scraps"
  on public.wc_scraps_teams for select using (
    exists (
      select 1 from public.pool_members
      where pool_members.pool_id = wc_scraps_teams.pool_id
        and pool_members.user_id = auth.uid()
    )
  );
