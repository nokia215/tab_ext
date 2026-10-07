-- A tab's owner must also own its parent group, on inserts and reparenting.
drop policy if exists "users_insert_own_tabs" on public.tabs;
create policy "users_insert_own_tabs" on public.tabs for insert
  with check (auth.uid() = user_id and exists (
    select 1 from public.tab_groups g where g.id = group_id and g.user_id = auth.uid()
  ));

drop policy if exists "users_update_own_tabs" on public.tabs;
create policy "users_update_own_tabs" on public.tabs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.tab_groups g where g.id = group_id and g.user_id = auth.uid()
  ));
