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
