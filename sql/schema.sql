create extension if not exists pgcrypto;

create table if not exists public.tab_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tab_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null default '',
  position integer not null,
  status text not null default 'saved' check (status in ('saved', 'restored', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tab_groups_user_created_at
  on public.tab_groups(user_id, created_at desc);

create index if not exists idx_tabs_group_position
  on public.tabs(group_id, position);

create index if not exists tabs_group_id_idx
  on public.tabs using btree (group_id);

alter table public.tab_groups enable row level security;
alter table public.tabs enable row level security;

drop policy if exists "users_select_own_tab_groups" on public.tab_groups;
create policy "users_select_own_tab_groups"
  on public.tab_groups
  for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own_tab_groups" on public.tab_groups;
create policy "users_insert_own_tab_groups"
  on public.tab_groups
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own_tab_groups" on public.tab_groups;
create policy "users_update_own_tab_groups"
  on public.tab_groups
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_tab_groups" on public.tab_groups;
create policy "users_delete_own_tab_groups"
  on public.tab_groups
  for delete
  using (auth.uid() = user_id);

drop policy if exists "users_select_own_tabs" on public.tabs;
create policy "users_select_own_tabs"
  on public.tabs
  for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own_tabs" on public.tabs;
create policy "users_insert_own_tabs"
  on public.tabs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own_tabs" on public.tabs;
create policy "users_update_own_tabs"
  on public.tabs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users_delete_own_tabs" on public.tabs;
create policy "users_delete_own_tabs"
  on public.tabs
  for delete
  using (auth.uid() = user_id);