alter table public.tab_groups
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

alter table public.tabs
  add column if not exists restored_at timestamptz;

update public.tab_groups
set archived_at = coalesce(public.tab_groups.archived_at, now())
where archived_at is null
  and exists (
    select 1
    from public.tabs
    where public.tabs.group_id = public.tab_groups.id
      and public.tabs.status = 'archived'
  )
  and not exists (
    select 1
    from public.tabs
    where public.tabs.group_id = public.tab_groups.id
      and public.tabs.status <> 'archived'
  );

update public.tabs
set status = 'saved',
    updated_at = now()
where status = 'archived';

update public.tabs
set restored_at = coalesce(restored_at, updated_at)
where status = 'restored'
  and restored_at is null;

alter table public.tabs
  drop constraint if exists tabs_status_check;

alter table public.tabs
  add constraint tabs_status_check check (status in ('saved', 'restored'));

create index if not exists idx_tab_groups_user_archived_at
  on public.tab_groups(user_id, archived_at);
