-- Run after migrations on a disposable Supabase DB; all fixtures roll back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/dashboard-schema.sql
begin;

do $$
begin
  assert (select count(*) = 2 from information_schema.columns
    where table_schema = 'public' and table_name in ('tabs', 'tab_groups')
      and column_name = 'created_at' and is_nullable = 'NO' and column_default = 'now()'),
    'Keep both creation timestamps and their defaults';
  assert to_regclass('public.idx_tab_groups_user_created_at') is null,
    'Do not retain the redundant shorter index';
end;
$$;

insert into auth.users (id) values
  ('14000000-0000-4000-8000-000000000001'),
  ('14000000-0000-4000-8000-000000000002');
-- Equal timestamps exercise the id tie-breaker used by pagination.
insert into public.tab_groups (id, user_id, device_id)
select md5('dashboard-schema-' || n)::uuid, '14000000-0000-4000-8000-000000000001', 'test'
from generate_series(1, 2000) n;
insert into public.tab_groups (id, user_id, device_id) values
  ('24000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000002', 'other');
insert into public.tabs (group_id, user_id, url, position)
select id, user_id, 'https://dashboard-schema.test/' || id, 0
from public.tab_groups where user_id in
  ('14000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002');
analyze public.tab_groups;
analyze public.tabs;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
do $$
declare
  plan json;
  changed integer;
begin
  execute 'explain (format json) select id, created_at from public.tab_groups
    where user_id = ''14000000-0000-4000-8000-000000000001''
    order by created_at desc, id desc limit 100' into plan;
  assert plan::text like '%idx_tab_groups_user_created_at_id%', 'Use the pagination index';
  assert plan::text not like '%"Node Type": "Sort"%', 'No extra pagination sort';
  assert plan::text like '%InitPlan%', 'Evaluate RLS auth.uid() through an InitPlan';

  assert (select count(*) = 2000 from public.tab_groups), 'Hide other users groups';
  assert (select count(*) = 2000 from public.tabs), 'Hide other users tabs';
  update public.tab_groups set title = 'forbidden'
    where user_id = '14000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  assert changed = 0, 'Cannot edit another users group';
  update public.tabs set title = 'forbidden'
    where user_id = '14000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  assert changed = 0, 'Cannot edit another users tab';
  delete from public.tabs where user_id = '14000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  assert changed = 0, 'Cannot delete another users tab';
  delete from public.tab_groups where user_id = '14000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  assert changed = 0, 'Cannot delete another users group';
  begin
    insert into public.tab_groups (user_id, device_id)
      values ('14000000-0000-4000-8000-000000000002', 'forbidden');
    raise exception 'Accepted a foreign owner';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tabs set user_id = '14000000-0000-4000-8000-000000000002';
    raise exception 'Accepted an ownership change';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  assert not exists (select 1 from public.tab_groups), 'No groups without authentication';
  assert not exists (select 1 from public.tabs), 'No tabs without authentication';
end;
$$;
rollback;
