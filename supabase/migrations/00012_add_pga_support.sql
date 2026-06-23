-- Add PGA Tour game type support

-- 1. Allow 'pga' as a game_type on pools
alter table public.pools drop constraint pools_game_type_check;
alter table public.pools add constraint pools_game_type_check
  check (game_type in ('cfb', 'world_cup', 'pga'));

-- 2. PGA tournaments (child of pools — one league has many tournaments)
create table public.pga_tournaments (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  espn_event_id text,
  name text not null,
  season_year int not null,
  start_date date,
  end_date date,
  golfers_per_manager int not null default 7,
  top_n_scoring int not null default 5,
  enable_scraps boolean not null default false,
  draft_status text not null default 'pre_draft'
    check (draft_status in ('pre_draft', 'in_progress', 'completed')),
  draft_order_mode text not null default 'random'
    check (draft_order_mode in ('manual', 'random')),
  created_at timestamptz not null default now()
);

create index idx_pga_tournaments_pool on public.pga_tournaments(pool_id);

-- 3. Tournament members (subset of pool_members per tournament)
create table public.pga_tournament_members (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.pga_tournaments(id) on delete cascade,
  pool_member_id uuid not null references public.pool_members(id) on delete cascade,
  draft_position int,
  unique(tournament_id, pool_member_id)
);

create index idx_pga_tmembers_tournament on public.pga_tournament_members(tournament_id);

-- 4. Cached golfer field per tournament
create table public.pga_golfers (
  id text not null,
  tournament_id uuid not null references public.pga_tournaments(id) on delete cascade,
  name text not null,
  amateur boolean not null default false,
  country text,
  image_url text,
  odds_draftkings text,
  odds_mgm text,
  odds_betonline text,
  status text not null default 'active'
    check (status in ('active', 'cut', 'withdrawn', 'disqualified')),
  position text,
  total_score int,
  total_strokes int,
  r1_score int,
  r2_score int,
  r3_score int,
  r4_score int,
  r1_strokes int,
  r2_strokes int,
  r3_strokes int,
  r4_strokes int,
  tee_time text,
  thru text,
  fetched_at timestamptz not null default now(),
  primary key (id, tournament_id)
);

create index idx_pga_golfers_tournament on public.pga_golfers(tournament_id);

-- 5. Draft state per tournament
create table public.pga_draft_state (
  tournament_id uuid primary key references public.pga_tournaments(id) on delete cascade,
  current_round int not null default 1,
  current_pick_number int not null default 1,
  current_member_id uuid references public.pga_tournament_members(id),
  updated_at timestamptz not null default now()
);

-- 6. Draft picks per tournament
create table public.pga_draft_picks (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.pga_tournaments(id) on delete cascade,
  member_id uuid not null references public.pga_tournament_members(id),
  round int not null,
  pick_number int not null,
  golfer_id text not null,
  golfer_name text not null,
  picked_at timestamptz not null default now(),
  unique(tournament_id, golfer_id),
  unique(tournament_id, pick_number)
);

-- ============================================================
-- RLS policies
-- ============================================================

-- pga_tournaments: viewable by pool members
alter table public.pga_tournaments enable row level security;

create policy "Pool members can view PGA tournaments"
  on public.pga_tournaments for select
  to authenticated
  using (pool_id in (select public.user_pool_ids()));

create policy "Admins can insert PGA tournaments"
  on public.pga_tournaments for insert
  to authenticated
  with check (pool_id in (select id from public.pools where admin_id = auth.uid()));

create policy "Admins can update PGA tournaments"
  on public.pga_tournaments for update
  to authenticated
  using (pool_id in (select id from public.pools where admin_id = auth.uid()));

create policy "Admins can delete PGA tournaments"
  on public.pga_tournaments for delete
  to authenticated
  using (pool_id in (select id from public.pools where admin_id = auth.uid()));

-- pga_tournament_members: viewable by pool members
alter table public.pga_tournament_members enable row level security;

create policy "Pool members can view tournament members"
  on public.pga_tournament_members for select
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments where pool_id in (select public.user_pool_ids())
  ));

create policy "Admins can insert tournament members"
  on public.pga_tournament_members for insert
  to authenticated
  with check (tournament_id in (
    select id from public.pga_tournaments
    where pool_id in (select id from public.pools where admin_id = auth.uid())
  ));

create policy "Admins can update tournament members"
  on public.pga_tournament_members for update
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments
    where pool_id in (select id from public.pools where admin_id = auth.uid())
  ));

create policy "Admins can delete tournament members"
  on public.pga_tournament_members for delete
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments
    where pool_id in (select id from public.pools where admin_id = auth.uid())
  ));

-- pga_golfers: viewable by pool members (updated by admin client)
alter table public.pga_golfers enable row level security;

create policy "Pool members can view PGA golfers"
  on public.pga_golfers for select
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments where pool_id in (select public.user_pool_ids())
  ));

-- pga_draft_state: viewable by pool members
alter table public.pga_draft_state enable row level security;

create policy "Pool members can view PGA draft state"
  on public.pga_draft_state for select
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments where pool_id in (select public.user_pool_ids())
  ));

-- pga_draft_picks: viewable by pool members
alter table public.pga_draft_picks enable row level security;

create policy "Pool members can view PGA draft picks"
  on public.pga_draft_picks for select
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments where pool_id in (select public.user_pool_ids())
  ));

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table public.pga_draft_picks;
alter publication supabase_realtime add table public.pga_draft_state;
alter publication supabase_realtime add table public.pga_tournaments;
