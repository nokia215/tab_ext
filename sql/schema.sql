create extension if not exists pgcrypto;

create table if not exists public.tab_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  title text,
  created_at timestamptz not null default now(),
  is_favorite boolean not null default false
);

create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tab_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null default '',
  position integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tab_groups_user_created_at
  on public.tab_groups(user_id, created_at desc);

create index if not exists idx_tabs_group_position
  on public.tabs(group_id, position);

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
  with check (auth.uid() = user_id and exists (
    select 1 from public.tab_groups g where g.id = group_id and g.user_id = auth.uid()
  ));

drop policy if exists "users_update_own_tabs" on public.tabs;
create policy "users_update_own_tabs"
  on public.tabs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.tab_groups g where g.id = group_id and g.user_id = auth.uid()
  ));

drop policy if exists "users_delete_own_tabs" on public.tabs;
create policy "users_delete_own_tabs"
  on public.tabs
  for delete
  using (auth.uid() = user_id);

-- Saved tabs and favorites are preserved.
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
      and g.is_favorite is not true
      and not exists (select 1 from public.tabs t where t.group_id = g.id);
end;
$$;

revoke all on function public.consume_restored_tabs(uuid, uuid[]) from public, anon;
grant execute on function public.consume_restored_tabs(uuid, uuid[]) to authenticated;

create or replace function public.tab_url_key(raw_url text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  clean_url text := split_part(btrim(raw_url), '#', 1);
  parts text[];
begin
  parts := regexp_match(clean_url, '^([a-zA-Z][a-zA-Z0-9+.-]*://)([^/?#]+)(.*)$');
  if parts is not null then
    clean_url := lower(parts[1]) || lower(parts[2]) || parts[3];
  end if;
  return encode(sha256(convert_to(clean_url, 'UTF8')), 'hex');
end;
$$;

create unique index if not exists tabs_user_url_hash_unique
  on public.tabs(user_id, public.tab_url_key(url));

create or replace function public.save_tab_group(
  p_title text, p_device_id text, p_tabs jsonb, p_group_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  saved_group public.tab_groups%rowtype;
  next_position integer := 0;
  saved_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_tabs) is distinct from 'array' then
    raise exception 'Tabs must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tabs) = 0 or exists (
    select 1 from jsonb_array_elements(p_tabs) t
    where jsonb_typeof(t) is distinct from 'object'
      or jsonb_typeof(t->'url') is distinct from 'string'
      or btrim(t->>'url') !~* '^((https?|ftp)://[^/[:space:]]+|file:/)'
      or (t ? 'title' and jsonb_typeof(t->'title') is distinct from 'string')
  ) then
    raise exception 'Invalid tabs' using errcode = '22023';
  end if;

  if p_group_id is null then
    insert into public.tab_groups (user_id, device_id, title)
    values (owner_id, p_device_id, p_title) returning * into saved_group;
  else
    -- Serialize append positions with restore cleanup and other saves.
    select * into saved_group from public.tab_groups
      where id = p_group_id and user_id = owner_id for update;
    if not found then
      raise exception 'Missing or inaccessible group' using errcode = '42501';
    end if;
    select coalesce(max(position) + 1, 0) into next_position
      from public.tabs where group_id = saved_group.id;
  end if;

  with inserted as (
    insert into public.tabs (group_id, user_id, url, title, position)
    select saved_group.id, owner_id, t->>'url', coalesce(t->>'title', ''),
      next_position + (ordinality - 1)::integer
    from jsonb_array_elements(p_tabs) with ordinality as input(t, ordinality)
    order by ordinality
    on conflict (user_id, public.tab_url_key(url)) do nothing
    returning 1
  )
  select count(*)::integer into saved_count from inserted;

  if saved_count = 0 and p_group_id is null then
    delete from public.tab_groups where id = saved_group.id;
    return jsonb_build_object('group', null, 'count', 0);
  end if;
  return jsonb_build_object('group', jsonb_build_object(
    'id', saved_group.id, 'title', saved_group.title, 'device_id', saved_group.device_id,
    'created_at', saved_group.created_at, 'is_fixed', saved_group.is_fixed,
    'is_favorite', saved_group.is_favorite
  ), 'count', saved_count);
end;
$$;

revoke all on function public.save_tab_group(text, text, jsonb, uuid) from public, anon;
grant execute on function public.save_tab_group(text, text, jsonb, uuid) to authenticated;
