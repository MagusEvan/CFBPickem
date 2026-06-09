-- Add missing UPDATE/DELETE RLS policies for draft and scraps tables.
-- All mutations currently go through the admin client (service role),
-- but these policies ensure defense-in-depth if direct client access
-- is ever added.

-- draft_picks: admins can update and delete
create policy "Admins can update draft picks"
  on public.draft_picks for update
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

create policy "Admins can delete draft picks"
  on public.draft_picks for delete
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

-- draft_state: admins can insert and update
create policy "Admins can insert draft state"
  on public.draft_state for insert
  to authenticated
  with check (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

create policy "Admins can update draft state"
  on public.draft_state for update
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

create policy "Admins can delete draft state"
  on public.draft_state for delete
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

-- team_scraps: admins can insert and delete
create policy "Admins can insert team scraps"
  on public.team_scraps for insert
  to authenticated
  with check (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

create policy "Admins can delete team scraps"
  on public.team_scraps for delete
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

-- wc_scraps_teams: admins can insert and delete
create policy "Admins can insert WC scraps"
  on public.wc_scraps_teams for insert
  to authenticated
  with check (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );

create policy "Admins can delete WC scraps"
  on public.wc_scraps_teams for delete
  to authenticated
  using (
    pool_id in (select id from public.pools where admin_id = auth.uid())
  );
