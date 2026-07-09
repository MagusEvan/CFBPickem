-- FF trades (Phase 7)

create table public.ff_trades (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  proposer_member_id uuid not null references public.pool_members(id) on delete cascade,
  recipient_member_id uuid not null references public.pool_members(id) on delete cascade,
  -- ff_players ids each side sends away
  proposer_player_ids text[] not null,
  recipient_player_ids text[] not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'rejected', 'cancelled', 'vetoed', 'executed')),
  resolution text,                     -- e.g. why execution failed / veto note
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  executed_at timestamptz
);

create index idx_ff_trades_pool on public.ff_trades(pool_id, created_at desc);

alter table public.ff_trades enable row level security;
create policy "Pool members can view FF trades"
  on public.ff_trades for select to authenticated
  using (pool_id in (select public.user_pool_ids()));
