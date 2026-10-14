-- Compare real plans on generated data in a disposable DB; all changes roll back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/group-index.sql
begin;
insert into auth.users (id) values ('13000000-0000-4000-8000-000000000001');
insert into public.tab_groups (id, user_id, device_id)
select md5('index-group-' || n)::uuid, '13000000-0000-4000-8000-000000000001', 'test'
from generate_series(1, 10000) n;
insert into public.tabs (group_id, user_id, url, position)
select md5('index-group-' || g)::uuid, '13000000-0000-4000-8000-000000000001',
  'https://index.test/' || g || '/' || p, p
from generate_series(1, 10000) g cross join generate_series(0, 9) p;
analyze public.tabs;
create index if not exists tabs_group_id_idx on public.tabs(group_id);
explain (analyze, buffers) select * from public.tabs where group_id = md5('index-group-5000')::uuid;
explain (analyze, buffers) select * from public.tabs where group_id = md5('index-group-5000')::uuid order by position;
explain (analyze, buffers) select exists (select 1 from public.tabs where group_id = md5('index-group-5000')::uuid);
drop index public.tabs_group_id_idx;
explain (analyze, buffers) select * from public.tabs where group_id = md5('index-group-5000')::uuid;
explain (analyze, buffers) select * from public.tabs where group_id = md5('index-group-5000')::uuid order by position;
explain (analyze, buffers) select exists (select 1 from public.tabs where group_id = md5('index-group-5000')::uuid);
explain (analyze, buffers) select coalesce(max(position) + 1, 0) from public.tabs where group_id = md5('index-group-5000')::uuid;
rollback;
