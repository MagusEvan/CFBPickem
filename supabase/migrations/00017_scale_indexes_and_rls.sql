-- Scalability: missing indexes + tighten pools RLS.
--
-- Index audit notes: draft_picks(pool_id), pga_draft_picks(tournament_id),
-- pool_members(pool_id, user_id), team_scraps(pool_id), and wc_scraps_teams(pool_id)
-- are already covered by existing unique constraints. The two real gaps are below.

-- Used by user_pool_ids() (security-definer helper) on nearly every RLS check
create index idx_pool_members_user on public.pool_members(user_id);

-- Used by "admin_id = auth.uid()" subqueries in many admin policies
create index idx_pools_admin on public.pools(admin_id);

-- Admins must be able to view their own pools regardless of membership.
-- Required for the insert..returning in createPool, which runs before the
-- admin's auto-join pool_members row exists.
create policy "Admins can view their pools"
  on public.pools for select
  to authenticated
  using (admin_id = auth.uid());

-- Drop the permissive policy that let ANY authenticated user read ALL pools —
-- including invite codes, which effectively made every pool joinable and
-- enumerable. The join flow does not rely on this policy: it looks up pools by
-- invite code via the service-role admin client (getPoolByInviteCode).
drop policy "Anyone can view pool by invite code" on public.pools;
