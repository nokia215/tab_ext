alter table public.tabs
  drop column if exists status,
  drop column if exists restored_at;
