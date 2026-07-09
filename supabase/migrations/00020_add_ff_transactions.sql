-- FF waivers, free agency, and transaction log (Phase 6)

-- 1. Waiver processing state (one row per FF pool; created lazily)
create table public.ff_waiver_state (
  pool_id uuid primary key references public.pools(id) on delete cascade,
  next_process_at timestamptz,         -- null until first computed from settings
  processing boolean not null default false,
  processing_claimed_at timestamptz,   -- stale-claim recovery
  updated_at timestamptz not null default now()
);

-- 2. Waiver priority + FAAB ledger (one row per member; created lazily
--    in reverse draft order after the draft completes)
create table public.ff_waiver_priority (
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  priority int not null,               -- 1 = first claim
  faab_spent int not null default 0,
  primary key (pool_id, member_id)
);

-- 3. Waiver claims
create table public.ff_waiver_claims (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.pool_members(id) on delete cascade,
  add_player_id text not null references public.ff_players(id),
  drop_player_id text references public.ff_players(id),  -- null = pure add
  bid int not null default 0,          -- FAAB bid (0 for priority leagues)
  claim_order int not null default 1,  -- member's own preference order
  status text not null default 'pending'
    check (status in ('pending', 'won', 'lost', 'cancelled', 'invalid')),
  resolution text,                     -- why a claim lost/was invalid
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_ff_waiver_claims_pool on public.ff_waiver_claims(pool_id, status);

-- 4. Waiver locks: recently dropped players stay claim-only until the next
--    scheduled processing time
create table public.ff_player_waivers (
  pool_id uuid not null references public.pools(id) on delete cascade,
  player_id text not null references public.ff_players(id),
  clears_at timestamptz not null,
  primary key (pool_id, player_id)
);

-- 5. Immutable transaction audit log
create table public.ff_transactions (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid references public.pool_members(id) on delete set null,
  type text not null
    check (type in ('free_agent_add', 'drop', 'waiver_claim', 'trade', 'commissioner')),
  detail jsonb not null default '{}',  -- player names/ids, bid, trade contents
  created_at timestamptz not null default now()
);

create index idx_ff_transactions_pool on public.ff_transactions(pool_id, created_at desc);

-- ============================================================
-- RLS (all mutations via admin client)
-- ============================================================

alter table public.ff_waiver_state enable row level security;
create policy "Pool members can view FF waiver state"
  on public.ff_waiver_state for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_waiver_priority enable row level security;
create policy "Pool members can view FF waiver priority"
  on public.ff_waiver_priority for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

-- Pending claims are visible only to their owner and the commissioner;
-- resolved claims are visible to the whole pool.
alter table public.ff_waiver_claims enable row level security;
create policy "Members can view FF waiver claims"
  on public.ff_waiver_claims for select to authenticated
  using (
    pool_id in (select public.user_pool_ids())
    and (
      status <> 'pending'
      or exists (
        select 1 from public.pool_members pm
        where pm.id = ff_waiver_claims.member_id and pm.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.pools p
        where p.id = ff_waiver_claims.pool_id and p.admin_id = (select auth.uid())
      )
    )
  );

alter table public.ff_player_waivers enable row level security;
create policy "Pool members can view FF player waiver locks"
  on public.ff_player_waivers for select to authenticated
  using (pool_id in (select public.user_pool_ids()));

alter table public.ff_transactions enable row level security;
create policy "Pool members can view FF transactions"
  on public.ff_transactions for select to authenticated
  using (pool_id in (select public.user_pool_ids()));
