-- Run against a disposable Supabase database after applying migrations:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/tab-ownership.sql
-- Everything, including test users, is rolled back.
begin;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.tab_groups (id, user_id, device_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'test'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

insert into public.tabs (id, group_id, user_id, url, position) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'https://ownership-test.invalid/own', 0);

do $$
begin
  begin
    insert into public.tabs (group_id, user_id, url, position) values
      ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
       'https://ownership-test.invalid/foreign', 0);
    raise exception 'Foreign-group INSERT was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.tabs set group_id = '20000000-0000-4000-8000-000000000002'
      where id = '30000000-0000-4000-8000-000000000001';
    raise exception 'Foreign-group UPDATE was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
