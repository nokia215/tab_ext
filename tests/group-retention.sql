-- Run on a disposable Supabase database after migrations; fixtures roll back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/group-retention.sql
begin;
insert into auth.users (id) values ('13000000-0000-4000-8000-000000000001');
insert into public.tab_groups (user_id, device_id, title, is_favorite, is_fixed) values
  ('13000000-0000-4000-8000-000000000001', 'test', 'normal', false, false),
  ('13000000-0000-4000-8000-000000000001', 'test', 'favorite', true, false),
  ('13000000-0000-4000-8000-000000000001', 'test', 'fixed', false, true),
  ('13000000-0000-4000-8000-000000000001', 'test', 'both', true, true);
insert into public.tabs (group_id, user_id, url, position)
  select id, user_id, 'https://retention.test/' || title, 0
  from public.tab_groups where user_id = '13000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
declare
  saved_group record;
  tab_ids uuid[];
begin
  for saved_group in select * from public.tab_groups loop
    select array_agg(id) into tab_ids from public.tabs where group_id = saved_group.id;
    perform public.consume_restored_tabs(saved_group.id, tab_ids);
    -- Synchronization retries the same consumption after a reload or on another device.
    perform public.consume_restored_tabs(saved_group.id, tab_ids);
    assert (select count(*) from public.tab_groups where id = saved_group.id)
      = case when saved_group.is_favorite or saved_group.is_fixed then 1 else 0 end,
      'Only ordinary empty groups are removed';
    assert (select count(*) from public.tabs where group_id = saved_group.id)
      = case when saved_group.is_fixed then 1 else 0 end,
      'Fixed groups keep their tabs; favorites keep only their group';
    assert not exists (select 1 from public.tab_groups where id = saved_group.id
      and (is_favorite <> saved_group.is_favorite or is_fixed <> saved_group.is_fixed)),
      'Restore retries preserve group settings';
    if saved_group.is_favorite or saved_group.is_fixed then
      delete from public.tabs where group_id = saved_group.id;
      perform public.consume_restored_tabs(saved_group.id, tab_ids);
      assert exists (select 1 from public.tab_groups where id = saved_group.id),
        'Already empty favorite and fixed groups survive synchronization';
    end if;
  end loop;

  insert into public.tab_groups (user_id, device_id, title) values
    (auth.uid(), 'test', 'empty normal'), (auth.uid(), 'test', 'nonempty normal');
  insert into public.tabs (group_id, user_id, url, position)
    select id, user_id, 'https://retention.test/nonempty', 0
    from public.tab_groups where title = 'nonempty normal';
  assert public.delete_empty_tab_groups() = 1, 'Scheduled cleanup removes only the ordinary empty group';
  assert (select count(*) from public.tab_groups) = 4,
    'Scheduled cleanup keeps empty favorites, fixed groups and nonempty normal groups';
  assert public.delete_empty_tab_groups() = 0, 'Repeated cleanup preserves protected groups';

  -- Keeping an empty group must not prevent the user's explicit delete action.
  delete from public.tab_groups;
  assert not exists (select 1 from public.tab_groups);
end;
$$;
rollback;
