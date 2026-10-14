begin;

lock table public.tabs in access exclusive mode;

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
  return encode(sha256(convert_to(clean_url, 'UTF8')), 'hex');
end;
$$;

-- Build the replacement before removing the old constraint; never delete tabs.
create unique index tabs_user_url_hash_unique
  on public.tabs(user_id, public.tab_url_key(url));

drop trigger if exists tabs_set_url_key on public.tabs;
drop function if exists public.set_tab_url_key();
alter table public.tabs drop column url_key;

create or replace function public.insert_saved_tabs(p_tabs jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with inserted as (
    insert into public.tabs (group_id, user_id, url, title, position)
    select group_id, user_id, url, title, position
    from jsonb_to_recordset(p_tabs) as t(
      group_id uuid, user_id uuid, url text, title text, position integer
    )
    on conflict (user_id, public.tab_url_key(url)) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$$;

revoke all on function public.insert_saved_tabs(jsonb) from public, anon;
grant execute on function public.insert_saved_tabs(jsonb) to authenticated;

commit;
