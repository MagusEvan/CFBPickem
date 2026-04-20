-- Reference table for conferences
create table public.conferences (
  key text primary key,
  display_name text not null,
  cfbd_name text,
  espn_group_id text,
  is_depleting boolean not null default false,
  sort_order int not null default 0
);

-- RLS: readable by all authenticated users
alter table public.conferences enable row level security;

create policy "Anyone can view conferences"
  on public.conferences for select
  to authenticated
  using (true);
