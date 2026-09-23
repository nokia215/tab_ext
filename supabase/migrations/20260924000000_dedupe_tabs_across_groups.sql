create or replace function public.tab_url_key(raw_url text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  clean_url text := split_part(btrim(raw_url), '#', 1);
  parts text[];
begin
  parts := regexp_match(clean_url, '^([a-zA-Z][a-zA-Z0-9+.-]*://)([^/?#]+)(.*)$');
  if parts is not null then
    clean_url := lower(parts[1]) || lower(parts[2]) || parts[3];
  end if;
  return clean_url;
end;
$$;

alter table public.tabs add column if not exists url_key text;
update public.tabs set url_key = public.tab_url_key(url) where url_key is null;

with ranked as (
  select t.id,
    row_number() over (
      partition by t.user_id, t.url_key
      order by g.created_at, t.position, t.created_at, t.id
    ) as duplicate_rank
  from public.tabs t
  join public.tab_groups g on g.id = t.group_id
)
delete from public.tabs t using ranked r
where t.id = r.id and r.duplicate_rank > 1;

alter table public.tabs alter column url_key set not null;

create or replace function public.set_tab_url_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.url_key := public.tab_url_key(new.url);
  return new;
end;
$$;

drop trigger if exists tabs_set_url_key on public.tabs;
create trigger tabs_set_url_key
before insert or update of url on public.tabs
for each row execute function public.set_tab_url_key();

create unique index if not exists tabs_user_url_key_unique
  on public.tabs(user_id, url_key);
