begin;

-- Match both ordering keys used by paginated dashboard reads.
create index idx_tab_groups_user_created_at_id
  on public.tab_groups(user_id, created_at desc, id desc);
drop index public.idx_tab_groups_user_created_at;

-- Evaluate the session user once per statement, preserving ownership checks.
alter policy "users_select_own_tab_groups" on public.tab_groups
  using ((select auth.uid()) = user_id);
alter policy "users_insert_own_tab_groups" on public.tab_groups
  with check ((select auth.uid()) = user_id);
alter policy "users_update_own_tab_groups" on public.tab_groups
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "users_delete_own_tab_groups" on public.tab_groups
  using ((select auth.uid()) = user_id);

alter policy "users_select_own_tabs" on public.tabs
  using ((select auth.uid()) = user_id);
alter policy "users_insert_own_tabs" on public.tabs
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.tab_groups g where g.id = group_id and g.user_id = (select auth.uid())
  ));
alter policy "users_update_own_tabs" on public.tabs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.tab_groups g where g.id = group_id and g.user_id = (select auth.uid())
  ));
alter policy "users_delete_own_tabs" on public.tabs
  using ((select auth.uid()) = user_id);

commit;
