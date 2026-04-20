-- Pools table
create table public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  admin_id uuid not null references public.profiles(id),
  season_year int not null default extract(year from now()),
  invite_code text unique not null,
  max_managers int not null default 10 check (max_managers between 4 and 16),
  conferences jsonb not null default '["ACC","B12","B1G","SEC","CUSA","MAC","MW","SBC","AAC","PAC12_IND"]'::jsonb,
  num_rounds int not null default 10,
  scoring_strategy text not null default 'wins_only',
  draft_status text not null default 'pre_draft' check (draft_status in ('pre_draft', 'in_progress', 'completed')),
  draft_order_mode text not null default 'random' check (draft_order_mode in ('manual', 'random')),
  created_at timestamptz not null default now()
);

-- Pool members table
create table public.pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  draft_position int,
  joined_at timestamptz not null default now(),
  unique (pool_id, user_id)
);

-- RLS for pools
alter table public.pools enable row level security;

create policy "Members can view their pools"
  on public.pools for select
  to authenticated
  using (
    id in (select pool_id from public.pool_members where user_id = auth.uid())
  );

create policy "Authenticated users can create pools"
  on public.pools for insert
  to authenticated
  with check (admin_id = auth.uid());

create policy "Admins can update their pools"
  on public.pools for update
  to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- Allow anyone to read a pool by invite code (for join flow)
create policy "Anyone can view pool by invite code"
  on public.pools for select
  to authenticated
  using (true);

-- RLS for pool_members
alter table public.pool_members enable row level security;

-- Helper function to avoid infinite recursion in pool_members RLS
create or replace function public.user_pool_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select pool_id from public.pool_members where user_id = auth.uid();
$$;

create policy "Members can view pool members"
  on public.pool_members for select
  to authenticated
  using (pool_id in (select public.user_pool_ids()));

create policy "Users can join pools"
  on public.pool_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Admins can update member positions"
  on public.pool_members for update
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

create policy "Admins can remove members"
  on public.pool_members for delete
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );
