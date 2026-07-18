-- Championship/history records: a snapshot of final standings per pool,
-- written by an explicit pool-admin "Finalize Season" action.

create table public.pool_championships (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  game_type text not null,
  season_year int not null,
  champion_user_id uuid references public.profiles(id),
  final_standings jsonb not null,
  finalized_at timestamptz not null default now(),
  finalized_by uuid references public.profiles(id),
  unique (pool_id)
);

alter table public.pool_championships enable row level security;

-- Trophies are visible to any signed-in user (profile pages); writes go
-- through the service role inside pool-admin-gated server actions.
create policy "pool_championships_read" on public.pool_championships
  for select to authenticated using (true);

create index pool_championships_champion_idx
  on public.pool_championships (champion_user_id);
