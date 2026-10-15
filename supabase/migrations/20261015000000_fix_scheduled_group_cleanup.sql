-- The production cron job calls this function daily; preserve protected groups.
create or replace function public.delete_empty_tab_groups()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.tab_groups g
    where not g.is_favorite and not g.is_fixed
      and not exists (select 1 from public.tabs t where t.group_id = g.id);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
