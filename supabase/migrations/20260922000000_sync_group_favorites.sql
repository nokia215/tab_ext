-- Existing rows remain NULL until a legacy device imports its local favorite.
-- Explicit true/false values prevent another device from undoing a later change.
alter table public.tab_groups
  add column if not exists is_favorite boolean;

alter table public.tab_groups
  alter column is_favorite set default false;
