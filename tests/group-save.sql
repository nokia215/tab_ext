-- Run on a disposable Supabase database after migrations; fixtures roll back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/group-save.sql
begin;
insert into auth.users (id) values
  ('12000000-0000-4000-8000-000000000001'),
  ('12000000-0000-4000-8000-000000000002');
insert into public.tab_groups (id, user_id, device_id, title, is_favorite) values
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'PC', 'Original', true),
  ('22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', 'Other', 'Private', false);
insert into public.tabs (group_id, user_id, url, title, position) values
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001',
   'HTTPS://EXAMPLE.TEST/Path?q=1#original', 'Original', 4);
alter table public.tabs add constraint save_test_failure check (title <> '__fail_insert__');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
do $$
declare
  result jsonb;
  before_groups integer;
  before_tabs integer;
begin
  result := public.save_tab_group('New', 'Tablet', '[
    {"url":"https://example.test/Path?q=1#duplicate"},
    {"url":"https://example.test/Path?q=2#kept","title":"New"},
    {"url":"https://example.test/Path?q=2#duplicate"}
  ]');
  assert (result->>'count')::integer = 1;
  assert (select url = 'https://example.test/Path?q=2#kept' and title = 'New'
    from public.tabs where group_id = (result->'group'->>'id')::uuid);
  select count(*) into before_groups from public.tab_groups;
  result := public.save_tab_group('All duplicates', 'PC', '[{"url":"https://example.test/Path?q=1"}]');
  assert result = '{"group":null,"count":0}'::jsonb;
  assert (select count(*) from public.tab_groups) = before_groups, 'No empty group remains';
  result := public.save_tab_group('Do not rename', 'Tablet', '[{"url":"https://append.test#kept"}]',
    '22000000-0000-4000-8000-000000000001');
  assert (result->>'count')::integer = 1;
  assert result->'group'->>'title' = 'Original';
  assert result->'group'->>'device_id' = 'PC';
  assert (result->'group'->>'is_favorite')::boolean;
  assert (select position from public.tabs where url = 'https://append.test#kept') = 5;
  result := public.save_tab_group('', 'PC', '[{"url":"https://append.test"}]',
    '22000000-0000-4000-8000-000000000001');
  assert (result->>'count')::integer = 0;
  assert result->'group'->>'id' = '22000000-0000-4000-8000-000000000001';
  select count(*) into before_tabs from public.tabs;
  begin
    perform public.save_tab_group('Forbidden', 'PC', '[{"url":"https://foreign.test"}]',
      '22000000-0000-4000-8000-000000000002');
    raise exception 'Foreign group was accessible';
  exception when insufficient_privilege then null;
  end;
  -- Failure inside the insert, after group creation, rolls back the whole RPC.
  begin
    perform public.save_tab_group('Rollback', 'PC', '[{"url":"https://valid.test"},{"url":"https://fail.test","title":"__fail_insert__"}]');
    raise exception 'Invalid title was accepted';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.tab_groups) = before_groups;
  assert (select count(*) from public.tabs) = before_tabs;
  begin
    perform public.save_tab_group('Invalid', 'PC', '[{"url":"chrome://newtab"}]');
    raise exception 'Invalid URL was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_tab_group('Invalid', 'PC', '[]');
    raise exception 'Empty tabs were accepted';
  exception when invalid_parameter_value then null;
  end;
  result := public.save_tab_group('Files', 'PC', '[{"url":"file:///tmp/test.txt"},{"url":"ftp://example.test/file"}]');
  assert (result->>'count')::integer = 2;
end;
$$;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.save_tab_group('Forbidden', 'PC', '[{"url":"https://anonymous.test"}]');
    raise exception 'Unauthenticated save was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.save_tab_group(text,text,jsonb,uuid)', 'execute');
  assert to_regprocedure('public.insert_saved_tabs(jsonb)') is null;
  assert (select is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'tab_groups' and column_name = 'is_favorite');
  begin
    update public.tab_groups set is_favorite = null
      where id = '22000000-0000-4000-8000-000000000001';
    raise exception 'NULL favorite was accepted';
  exception when not_null_violation then null;
  end;
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
    and ((table_name = 'tab_groups' and column_name in ('archived_at', 'updated_at'))
      or (table_name = 'tabs' and column_name = 'updated_at')));
  assert (select title = 'Original' and position = 4 from public.tabs
    where url = 'HTTPS://EXAMPLE.TEST/Path?q=1#original');
end;
$$;
rollback;
