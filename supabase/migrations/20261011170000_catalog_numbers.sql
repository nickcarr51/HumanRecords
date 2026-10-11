-- Permanent human-readable numbers, independent of UUIDs and feed ordering.
alter table public.albums add column catalog_number integer;
alter table public.tracks add column catalog_number integer;
with numbered as (
  select id, row_number() over (order by created_at, id)::integer as number from public.albums
)
update public.albums a set catalog_number = n.number from numbered n where a.id = n.id;
with numbered as (
  select id, row_number() over (order by created_at, id)::integer as number from public.tracks
)
update public.tracks t set catalog_number = n.number from numbered n where t.id = n.id;
alter table public.albums alter column catalog_number set not null;
alter table public.albums alter column catalog_number add generated always as identity;
alter table public.albums add constraint albums_catalog_number_key unique (catalog_number);
alter table public.tracks alter column catalog_number set not null;
alter table public.tracks alter column catalog_number add generated always as identity;
alter table public.tracks add constraint tracks_catalog_number_key unique (catalog_number);
select setval(pg_get_serial_sequence('public.albums', 'catalog_number'),
  coalesce((select max(catalog_number) from public.albums), 0) + 1, false);
select setval(pg_get_serial_sequence('public.tracks', 'catalog_number'),
  coalesce((select max(catalog_number) from public.tracks), 0) + 1, false);
create function public.keep_catalog_number() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.catalog_number is distinct from old.catalog_number then
    raise exception 'Catalog numbers cannot be changed';
  end if;
  return new;
end;
$$;
create trigger albums_keep_catalog_number before update of catalog_number on public.albums
  for each row execute function public.keep_catalog_number();
create trigger tracks_keep_catalog_number before update of catalog_number on public.tracks
  for each row execute function public.keep_catalog_number();
