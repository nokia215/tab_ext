-- Run against a disposable Supabase database after applying migrations:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/tab-url-key.sql
-- All fixtures are rolled back.
begin;

do $$
begin
  assert public.tab_url_key(' HTTPS://EXAMPLE.TEST/Path?q=1#section ') =
    encode(sha256(convert_to('https://example.test/Path?q=1', 'UTF8')), 'hex');
  assert public.tab_url_key('https://example.test/Path?q=1#other') =
    public.tab_url_key('https://example.test/Path?q=1');
  assert public.tab_url_key('https://example.test/Path?q=1') <>
    public.tab_url_key('https://example.test/Path?q=2');
  assert public.tab_url_key('https://example.test/Path') <>
    public.tab_url_key('https://example.test/path');
  assert public.tab_url_key('https://example.test/日本語#節') =
    encode(sha256(convert_to('https://example.test/日本語', 'UTF8')), 'hex');
  assert public.tab_url_key(null) is null;
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tabs' and column_name = 'url_key'
  ), 'The redundant column must be removed';
  assert not exists (
    select 1 from pg_trigger where tgrelid = 'public.tabs'::regclass and tgname = 'tabs_set_url_key'
  ), 'The key maintenance trigger must be removed';
  assert to_regprocedure('public.insert_saved_tabs(jsonb)') is null;
  assert not has_function_privilege('anon', 'public.save_tab_group(text,text,jsonb,uuid)', 'execute');
end;
$$;

insert into auth.users (id) values
  ('11000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000002');
insert into public.tab_groups (id, user_id, device_id) values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'test'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'test'),
  ('21000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002', 'test');

-- Preserve the original URL, including its fragment.
insert into public.tabs (id, group_id, user_id, url, title, position) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001',
   '11000000-0000-4000-8000-000000000001', 'HTTPS://EXAMPLE.TEST/Path?q=1#original', 'Original', 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);

do $$
begin
  assert (public.save_tab_group('Test', 'test', '[
    {"url":"https://example.test/Path?q=1#duplicate","title":"Duplicate"},
    {"url":"https://example.test/Path?q=2","title":"Different query"}
  ]'::jsonb, '21000000-0000-4000-8000-000000000002')->>'count')::integer = 1,
    'Skip duplicates across groups and count only new rows';
  assert (public.save_tab_group('Test', 'test', '[
    {"url":"https://example.test/Path?q=1#duplicate","title":"Duplicate"}
  ]'::jsonb, '21000000-0000-4000-8000-000000000002')->>'count')::integer = 0;
  begin
    perform public.save_tab_group('Forbidden', 'test', '[{"url":"https://example.test/foreign"}]',
      '21000000-0000-4000-8000-000000000003');
    raise exception 'RPC allowed insertion into another user''s group';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Different owners still save independently.
insert into public.tabs (group_id, user_id, url, position) values
  ('21000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002',
   'https://example.test/Path?q=1', 0);

do $$
begin
  assert (select count(*) from public.tabs where user_id in
    ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002')) = 3;
  assert (select url = 'HTTPS://EXAMPLE.TEST/Path?q=1#original' and title = 'Original'
    and position = 0 from public.tabs
    where id = '31000000-0000-4000-8000-000000000001');
end;
$$;

update public.tabs set url = 'https://example.test/Changed#kept'
where id = '31000000-0000-4000-8000-000000000001';

do $$
begin
  assert (select url = 'https://example.test/Changed#kept' and title = 'Original'
    from public.tabs
    where id = '31000000-0000-4000-8000-000000000001');
  begin
    update public.tabs set url = 'https://example.test/Path?q=2#collision'
    where id = '31000000-0000-4000-8000-000000000001';
    raise exception 'Updating a URL bypassed duplicate prevention';
  exception when unique_violation then null;
  end;
end;
$$;

rollback;
