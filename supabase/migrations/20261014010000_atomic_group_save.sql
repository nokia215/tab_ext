begin;

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

alter table public.tab_groups
  drop column archived_at,
  drop column updated_at;
alter table public.tabs drop column updated_at;

-- tests/group-index.sql verified the remaining index on 100,000 generated tabs.
drop index public.tabs_group_id_idx;

commit;
