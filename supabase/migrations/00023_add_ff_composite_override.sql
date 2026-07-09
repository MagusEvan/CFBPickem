-- Manual composite override: when set, it wins over the calculated
-- rank_composite for draft order (default_rank recompute). Cleared to fall
-- back to the calculated mean of source ranks.
alter table public.ff_players add column rank_composite_override real;
