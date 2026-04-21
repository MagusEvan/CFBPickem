-- Draft picks table
create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid references public.pool_members(id),  -- null for team scraps
  round int not null,
  pick_number int not null,
  conference_key text not null references public.conferences(key),
  team_id text not null,
  team_name text not null,
  is_bonus_pick boolean not null default false,
  bonus_conference_key text references public.conferences(key),
  picked_at timestamptz not null default now(),
  unique (pool_id, team_id),
  unique (pool_id, pick_number)
);

-- Draft state table (one row per pool)
create table public.draft_state (
  pool_id uuid primary key references public.pools(id) on delete cascade,
  current_round int not null default 1,
  current_pick_number int not null default 1,
  current_member_id uuid references public.pool_members(id),
  conference_key text references public.conferences(key),
  pac12_ind_depleted boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Team scraps table (fixed at draft completion)
create table public.team_scraps (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  conference_key text not null references public.conferences(key),
  team_id text not null,
  team_name text not null,
  wins int not null default 0,
  created_at timestamptz not null default now(),
  unique (pool_id, conference_key)
);

-- RLS for draft_picks
alter table public.draft_picks enable row level security;

create policy "Members can view draft picks"
  on public.draft_picks for select
  to authenticated
  using (
    pool_id in (select public.user_pool_ids())
  );

create policy "Members can insert own picks"
  on public.draft_picks for insert
  to authenticated
  with check (
    member_id in (select id from public.pool_members where user_id = auth.uid())
  );

-- RLS for draft_state
alter table public.draft_state enable row level security;

create policy "Members can view draft state"
  on public.draft_state for select
  to authenticated
  using (
    pool_id in (select public.user_pool_ids())
  );

-- RLS for team_scraps
alter table public.team_scraps enable row level security;

create policy "Members can view team scraps"
  on public.team_scraps for select
  to authenticated
  using (
    pool_id in (select public.user_pool_ids())
  );

-- Enable realtime for draft and pool tables
alter publication supabase_realtime add table public.draft_picks;
alter publication supabase_realtime add table public.draft_state;
alter publication supabase_realtime add table public.pools;
