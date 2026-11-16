-- supabase/migrations/20261115120000_track_one_place.sql
-- Drizzle slice 3, schema part.
-- 1. tracks.archived_with_release: true while a track is archived because its
--    release was archived (archive_release, or removing an album's last live
--    track). Restore brings back exactly these tracks. Before this, restore
--    found them by matching archived_at to the release's archived_at; the
--    backfill below marks the same tracks that match would select.
-- 2. One track in one place: a track is on at most one album, and a single's
--    track is never also an album track. The app always creates a new track
--    (and a new R2 key) when it links one to a release.

alter table public.tracks add column archived_with_release boolean not null default false;

update public.tracks t
set archived_with_release = true
from public.releases r
where t.archived_at is not null
  and r.archived_at = t.archived_at
  and (r.track_id = t.id
    or r.album_id in (select ta.album_id from public.track_albums ta where ta.track_id = t.id));

-- A unique index, not a unique constraint: Supabase's API (PostgREST) reads a
-- unique constraint on track_albums.track_id as a one-to-one link and would
-- start returning a track's track_albums as an object instead of a list.
create unique index track_albums_track_id_key on public.track_albums (track_id);

-- A plain constraint can't compare two tables, so a trigger guards the
-- single/album overlap from both sides.
create function public.track_in_one_place()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'track_albums' then
    if exists (select 1 from public.releases where track_id = new.track_id) then
      raise exception 'A track can belong to only one release.' using errcode = '23505';
    end if;
  elsif new.track_id is not null then
    if exists (select 1 from public.track_albums where track_id = new.track_id) then
      raise exception 'A track can belong to only one release.' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.track_in_one_place() from public;
revoke execute on function public.track_in_one_place() from anon;
revoke execute on function public.track_in_one_place() from authenticated;

create trigger track_albums_one_place
  before insert or update of track_id on public.track_albums
  for each row execute function public.track_in_one_place();

create trigger releases_one_place
  before insert or update of track_id on public.releases
  for each row execute function public.track_in_one_place();
