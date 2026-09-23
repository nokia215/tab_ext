create extension if not exists pgcrypto;

create table if not exists public.tab_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  is_favorite boolean default false
);

create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tab_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null default '',
  position integer not null,
  status text not null default 'saved' check (status in ('saved', 'restored')),
  restored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tab_groups_user_created_at
  on public.tab_groups(user_id, created_at desc);

create index if not exists idx_tab_groups_user_archived_at
  on public.tab_groups(user_id, archived_at);

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

-- Existing tabs, favorites and archived groups are preserved. Legacy columns
-- remain for older clients; current clients no longer read their state.
alter table public.tab_groups
  add column if not exists is_fixed boolean not null default false;

create or replace function public.consume_restored_tabs(p_group_id uuid, p_tab_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  keep_tabs boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Serialize cleanup with group edits and FK-checked inserts. Only the IDs
  -- actually opened by this operation can be removed.
  select is_fixed into keep_tabs from public.tab_groups
    where id = p_group_id and user_id = auth.uid() for update;
  if not found or keep_tabs then return; end if;

  delete from public.tabs
    where group_id = p_group_id and user_id = auth.uid()
      and id = any(p_tab_ids);
  delete from public.tab_groups g
    where g.id = p_group_id and g.user_id = auth.uid() and not g.is_fixed
      and not exists (select 1 from public.tabs t where t.group_id = g.id);
end;
$$;

revoke all on function public.consume_restored_tabs(uuid, uuid[]) from public, anon;
grant execute on function public.consume_restored_tabs(uuid, uuid[]) to authenticated;
