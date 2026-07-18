-- App-wide settings (key/value) + per-user pool-creation limit override.
-- Global default for "max active pools a user may admin" lives in app_settings;
-- profiles.pool_limit_override (null = use global) lets site admins comp users.

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Readable by any signed-in user (e.g. to show the limit on pool creation);
-- no insert/update/delete policies — writes go through the service role only,
-- inside site-admin-gated server actions.
create policy "app_settings_read" on public.app_settings
  for select to authenticated using (true);

insert into public.app_settings (key, value)
values ('max_active_pools_per_user', '3'::jsonb);

alter table public.profiles
  add column pool_limit_override int null check (pool_limit_override >= 0);

-- Cheap active-pool counting for limit enforcement
create index if not exists pools_admin_season_idx
  on public.pools (admin_id, season_year);
