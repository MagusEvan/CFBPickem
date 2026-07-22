-- PGA Calcutta auction draft sub-type + generic odds cache

-- 1. Tournament-level draft type + calcutta config
alter table public.pga_tournaments
  add column draft_type text not null default 'snake'
    check (draft_type in ('snake', 'calcutta')),
  add column calcutta_settings jsonb;

-- 2. Calcutta odds on golfers (American odds, admin-editable)
alter table public.pga_golfers
  add column calcutta_odds int,
  add column odds_source text;

-- 3. Auction lots (money source of truth)
create table public.pga_calcutta_lots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.pga_tournaments(id) on delete cascade,
  lot_order int not null,
  kind text not null check (kind in ('golfer', 'scraps')),
  label text not null,
  golfer_ids text[] not null,
  status text not null default 'pending'
    check (status in ('pending', 'open', 'sold', 'unsold')),
  winner_member_id uuid references public.pga_tournament_members(id),
  price numeric,
  sold_at timestamptz,
  unique(tournament_id, lot_order)
);

create index idx_pga_calcutta_lots_tournament on public.pga_calcutta_lots(tournament_id);

-- 4. Bid audit / live feed
create table public.pga_calcutta_bids (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.pga_tournaments(id) on delete cascade,
  lot_id uuid not null references public.pga_calcutta_lots(id) on delete cascade,
  member_id uuid not null references public.pga_tournament_members(id),
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index idx_pga_calcutta_bids_lot on public.pga_calcutta_bids(lot_id);

-- 5. Auction lot state on draft state (mirrors FF auction lot columns)
alter table public.pga_draft_state
  add column current_lot_id uuid references public.pga_calcutta_lots(id),
  add column lot_high_bid numeric,
  add column lot_high_bidder_id uuid references public.pga_tournament_members(id),
  add column lot_deadline timestamptz,
  add column auction_cycle int not null default 1;

-- 6. Purchase price on picks (calcutta lots insert picks so rosters/leaderboards keep working)
alter table public.pga_draft_picks
  add column price numeric,
  add column lot_id uuid references public.pga_calcutta_lots(id) on delete set null;

-- 7. Generic cached odds (The Odds API), reusable across game types
create table public.cached_odds (
  sport_key text not null,
  event_key text not null default '',
  participant text not null,
  participant_norm text not null,
  price int not null,
  bookmaker text not null,
  fetched_at timestamptz not null default now(),
  primary key (sport_key, participant_norm, bookmaker)
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.pga_calcutta_lots enable row level security;

create policy "Pool members can view calcutta lots"
  on public.pga_calcutta_lots for select
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments where pool_id in (select public.user_pool_ids())
  ));

alter table public.pga_calcutta_bids enable row level security;

create policy "Pool members can view calcutta bids"
  on public.pga_calcutta_bids for select
  to authenticated
  using (tournament_id in (
    select id from public.pga_tournaments where pool_id in (select public.user_pool_ids())
  ));

alter table public.cached_odds enable row level security;

create policy "Authenticated users can view cached odds"
  on public.cached_odds for select
  to authenticated
  using (true);

-- ============================================================
-- Realtime
-- ============================================================

alter publication supabase_realtime add table public.pga_calcutta_lots;
alter publication supabase_realtime add table public.pga_calcutta_bids;
