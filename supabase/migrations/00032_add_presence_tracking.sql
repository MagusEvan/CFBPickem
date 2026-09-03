-- Track user online presence via heartbeat
alter table public.profiles
  add column last_active_at timestamptz;
