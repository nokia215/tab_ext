begin;

-- NULL was a marker for local favorite migration, which is no longer supported.
update public.tab_groups set is_favorite = false where is_favorite is null;
alter table public.tab_groups alter column is_favorite set not null;

drop function public.insert_saved_tabs(jsonb);

commit;
