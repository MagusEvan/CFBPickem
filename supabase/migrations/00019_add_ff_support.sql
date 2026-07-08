-- Add NFL Fantasy Football ('ff') game type support

-- 1. Allow 'ff' as a game_type on pools + league/scoring settings JSONB
alter table public.pools drop constraint pools_game_type_check;
alter table public.pools add constraint pools_game_type_check
  check (game_type in ('cfb', 'world_cup', 'pga', 'ff'));

alter table public.pools add column ff_league_settings jsonb;
alter table public.pools add column ff_scoring_settings jsonb;

-- ============================================================
-- Season-global NFL caches (no pool FK; written via admin client)
-- ============================================================

-- 2. Player catalog (~1,700 rostered players + 32 synthesized DST rows)
create table public.ff_players (
  id text primary key,                 -- ESPN athlete id, or 'DST-{abbrev}'
  name text not null,
  first_name text,
  last_name text,
  position text not null,              -- QB/RB/WR/TE/K/DST
  nfl_team_id text,                    -- ESPN team id; null = free agent IRL
  nfl_team_abbrev text,
  jersey text,
  headshot_url text,
  status text,                         -- active/questionable/out/ir/...
  injury_status text,
  default_rank int,                    -- autopick + draft board ordering
  active boolean not null default true,
  fetched_at timestamptz not null default now()
);

create index idx_ff_players_position on public.ff_players(position);
create index idx_ff_players_rank on public.ff_players(default_rank);

-- 3. NFL games (start_time drives lineup locks)
create table public.ff_nfl_games (
  id text primary key,                 -- ESPN event id
  season_year int not null,
  week int not null,
  season_type int not null default 2,  -- 2 = regular, 3 = postseason
  home_team_id text,
  away_team_id text,
  home_score int,
  away_score int,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'final')),
  status_detail text,
  start_time timestamptz not null,
  broadcasts jsonb,
  fetched_at timestamptz not null default now()
);

create index idx_ff_nfl_games_week on public.ff_nfl_games(season_year, week);

-- 4. Raw weekly stat lines (points computed on-read from league settings)
create table public.ff_player_stats (
  player_id text not null references public.ff_players(id) on delete cascade,
  season_year int not null,
  week int not null,
  nfl_game_id text,
  stats jsonb not null default '{}',   -- canonical stat map, see stat-map.ts
  fetched_at timestamptz not null default now(),
  primary key (player_id, season_year, week)
);

create index idx_ff_player_stats_week on public.ff_player_stats(season_year, week);

-- ============================================================
-- Per-pool fantasy domain
-- ============================================================

-- 5. Roster ownership (one row per owned player)
create table public.ff_rosters (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  player_id text not null references public.ff_players(id),
  acquired_via text not null default 'draft'
    check (acquired_via in ('draft', 'waiver', 'free_agent', 'trade', 'commissioner')),
  acquisition_cost int,                -- auction price or FAAB bid
  acquired_at timestamptz not null default now(),
  unique (pool_id, player_id)
);

create index idx_ff_rosters_pool_member on public.ff_rosters(pool_id, member_id);

-- 6. Weekly lineup slot assignments
create table public.ff_lineup_slots (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  week int not null,
  slot text not null
    check (slot in ('QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BENCH', 'IR')),
  slot_index int not null,             -- disambiguates RB1/RB2 etc.
  player_id text references public.ff_players(id),  -- null = empty slot
  locked_score numeric,                -- optional snapshot at week finalization
  updated_at timestamptz not null default now(),
  unique (pool_id, member_id, week, slot, slot_index)
);

create index idx_ff_lineups_pool_week on public.ff_lineup_slots(pool_id, week);

-- 7. Weekly head-to-head matchups
create table public.ff_matchups (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  week int not null,
  home_member_id uuid not null references public.pool_members(id) on delete cascade,
  away_member_id uuid references public.pool_members(id) on delete cascade,  -- null = bye
  is_playoff boolean not null default false,
  playoff_round int,
  playoff_seed_home int,
  playoff_seed_away int,
  created_at timestamptz not null default now(),
  unique (pool_id, week, home_member_id)
);

create index idx_ff_matchups_pool_week on public.ff_matchups(pool_id, week);

-- ============================================================
-- Draft (snake + auction)
-- ============================================================

-- 8. Draft state (pool-level; one draft per league)
create table public.ff_draft_state (
  pool_id uuid primary key references public.pools(id) on delete cascade,
  draft_type text not null default 'snake' check (draft_type in ('snake', 'auction')),
  status text not null default 'pre_draft'
    check (status in ('pre_draft', 'in_progress', 'paused', 'completed')),
  -- snake
  current_round int not null default 1,
  current_pick_number int not null default 1,
  current_member_id uuid references public.pool_members(id) on delete set null,
  -- timer (null = timer disabled)
  timer_seconds int,
  pick_deadline timestamptz,
  -- auction
  nominating_member_id uuid references public.pool_members(id) on delete set null,
  nomination_number int not null default 1,
  lot_player_id text references public.ff_players(id),
  lot_high_bid int,
  lot_high_bidder_id uuid references public.pool_members(id) on delete set null,
  lot_deadline timestamptz,
  updated_at timestamptz not null default now()
);

-- 9. Draft picks (auction picks have round null, price set)
create table public.ff_draft_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  round int,
  pick_number int not null,
  player_id text not null references public.ff_players(id),
  player_name text not null,
  player_position text not null,
  price int,
  auto boolean not null default false,
  picked_at timestamptz not null default now(),
  unique (pool_id, player_id),
  unique (pool_id, pick_number)
);

create index idx_ff_draft_picks_pool on public.ff_draft_picks(pool_id);

-- 10. Auction bid log (realtime; lot state on ff_draft_state is authoritative)
create table public.ff_auction_bids (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  nomination_number int not null,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  player_id text not null,
  amount int not null,
  created_at timestamptz not null default now()
);

create index idx_ff_bids_pool_nom on public.ff_auction_bids(pool_id, nomination_number);

-- 11. Auction budgets
create table public.ff_auction_budgets (
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  budget int not null,
  spent int not null default 0,
  primary key (pool_id, member_id)
);

-- ============================================================
-- RLS policies
-- ============================================================

-- Global caches: readable by all authenticated users; writes via admin client only
alter table public.ff_players enable row level security;
create policy "Authenticated users can view NFL players"
  on public.ff_players for select to authenticated using (true);

alter table public.ff_nfl_games enable row level security;
create policy "Authenticated users can view NFL games"
  on public.ff_nfl_games for select to authenticated using (true);

alter table public.ff_player_stats enable row level security;
create policy "Authenticated users can view NFL player stats"
  on public.ff_player_stats for select to authenticated using (true);

-- Pool-scoped tables: readable by pool members; all mutations via admin client
alter table public.ff_rosters enable row level security;
create policy "Pool members can view FF rosters"
  on public.ff_rosters for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_lineup_slots enable row level security;
create policy "Pool members can view FF lineups"
  on public.ff_lineup_slots for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_matchups enable row level security;
create policy "Pool members can view FF matchups"
  on public.ff_matchups for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_draft_state enable row level security;
create policy "Pool members can view FF draft state"
  on public.ff_draft_state for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_draft_picks enable row level security;
create policy "Pool members can view FF draft picks"
  on public.ff_draft_picks for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_auction_bids enable row level security;
create policy "Pool members can view FF auction bids"
  on public.ff_auction_bids for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_auction_budgets enable row level security;
create policy "Pool members can view FF auction budgets"
  on public.ff_auction_budgets for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

-- ============================================================
-- Realtime (draft coordination only — stats/lineups excluded to
-- avoid flooding channels with bulk upserts)
-- ============================================================

alter publication supabase_realtime add table public.ff_draft_state;
alter publication supabase_realtime add table public.ff_draft_picks;
alter publication supabase_realtime add table public.ff_auction_bids;
